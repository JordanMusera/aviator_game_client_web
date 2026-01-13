import { useEffect, useState, useCallback, useRef } from "react";
import { remote_url } from "../constants/api";
import {localSocket, pc_id, remoteSocket} from "../services/socket";
import { Unity, useUnityContext } from "react-unity-webgl";
import BettingTimer from "../components/BettingTimer";

/* ================= TYPES ================= */
interface MouseState {
    id: string;
    isPressed: boolean;
    error?: boolean;
    notification?: {
        type: 'good' | 'bad' | 'info';
        message: string;
    };
}

interface MouseInfo {
    mouseId: string;
    balance: number;
    active: boolean;
    customName?: string;
}

interface CrashHistoryItem {
    _id: string;
    crashPoint: number;
}

interface LiveBet {
    customName?: string;
    mouseId: string;
    amount: number;
    multiplier?: string;
    winAmount?: string;
    isBot?: boolean;
}

interface Jackpot{
    device:any;
    silver:any;
    gold:any;
}

/* ================= COMPONENT ================= */
const GamePlayPage = () => {
    /* ---------- STATE ---------- */
    const [mice, setMice] = useState<Record<string, MouseState>>({});
    const [miceIds, setMiceIds] = useState<string[]>([]);
    const [miceData, setMiceData] = useState<Record<string, MouseInfo>>({});
    const [stakes, setStakes] = useState<Record<string, number>>({});
    const [initialCrashHistory, setInitialCrashHistory] = useState<CrashHistoryItem[]>([]);
    const [status, setStatus] = useState<'WAITING' | 'BETTING' | 'IN_FLIGHT' | 'CRASHED'>('WAITING');
    const [timer, setTimer] = useState<number | null>(null);
    const [liveBets, setLiveBets] = useState<LiveBet[]>([]);
    const [currentMultiplier, setCurrentMultiplier] = useState<number>(1.00);
    const [jackpots,setJackpots] = useState<Jackpot>({device: {amount:0}, gold: {amount:0}, silver: {amount:0}});

    /* ---------- REFS ---------- */
    const statusRef = useRef(status);
    const stakesRef = useRef<Record<string, number>>({});
    const miceDataRef = useRef<Record<string, MouseInfo>>({});
    const miceIdsRef = useRef<string[]>([]); // Added to track local mice in socket listeners
    const activeRoundIdRef = useRef<string>("");
    const multiplierRef = useRef<number>(1.00);
    const historyScrollRef = useRef<HTMLDivElement>(null);

    const MAX_SLOTS = 5;
    const token = localStorage.getItem("token");
    const stationId = localStorage.getItem("stationId");
    const slotColors = ["#ef4444", "#22c55e", "#3b82f6", "#64748b", "#f59e0b"];

    /* ---------- UNITY ---------- */
    const { unityProvider, isLoaded, sendMessage } = useUnityContext({
        loaderUrl: "/unity-build/web_game.loader.js",
        dataUrl: "/unity-build/web_game.data.unityweb",
        frameworkUrl: "/unity-build/web_game.framework.js.unityweb",
        codeUrl: "/unity-build/web_game.wasm.unityweb",
    });

    /* ---------- REF SYNC ---------- */
    useEffect(() => { statusRef.current = status; }, [status]);
    useEffect(() => { stakesRef.current = stakes; }, [stakes]);
    useEffect(() => { miceDataRef.current = miceData; }, [miceData]);
    useEffect(() => { miceIdsRef.current = miceIds; }, [miceIds]);

    useEffect(() => {
        if (historyScrollRef.current) {
            historyScrollRef.current.scrollLeft = historyScrollRef.current.scrollWidth;
        }
    }, [initialCrashHistory]);

    /* ================= API ================= */
    const fetchMiceInfo = useCallback(async () => {
        if (!token) return;
        try {
            const res = await fetch(`${remote_url}/api/v1/device/info`, {
                headers: { Authorization: "Bearer " + token }
            });
            const json = await res.json();
            if (json.success && json.mice) {
                const map: Record<string, MouseInfo> = {};
                json.mice.forEach((m: MouseInfo) => (map[m.mouseId] = m));
                setMiceData(map);
            }
        } catch (e) {
            console.error("Fetch mice failed", e);
        }
    }, [token]);

    const registerNewMouse = useCallback(async (id: string) => {
        await fetch(`${remote_url}/api/v1/device/add-mouse`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer " + token,
            },
            body: JSON.stringify({ mice: [id] }),
        });
        fetchMiceInfo();
    }, [token, fetchMiceInfo]);

    const placeBet = async (mouseId: string, amount: number) => {
        if (!activeRoundIdRef.current) return;
        remoteSocket.emit("placeBet",{
            deviceId: pc_id,
            mouseId,
            amount: amount,
            roundId: activeRoundIdRef.current,
        });

    };

    const cashout = async (mouseId: string) => {
        if (!activeRoundIdRef.current) return;
        remoteSocket.emit("cashoutBet",{
            deviceId:pc_id,
            mouseId,
            multiplier: multiplierRef.current,
            roundId: activeRoundIdRef.current,
        });
    };

    /* ================= SOCKETS ================= */
    useEffect(() => {
        fetchMiceInfo();
    }, [fetchMiceInfo]);

    useEffect(() => {
        if (!stationId) return;
        remoteSocket.emit("joinDeviceSession", {
            stationId,
            deviceId:pc_id
        });

        const onStatus = (data: { event: string; id: string }) => {
            if (data.event === "connected") {
                setMice(prev => ({ ...prev, [data.id]: { id: data.id, isPressed: false } }));
                setMiceIds(prev =>
                    prev.includes(data.id) ? prev : [...prev, data.id].slice(0, MAX_SLOTS)
                );
                if (!miceDataRef.current[data.id]) registerNewMouse(data.id);
            } else {
                setMiceIds(prev => prev.filter(id => id !== data.id));
            }
        };

        const onClick = (data: { id: string, button: string }) => {
            const mid = data.id;
            const currentStatus = statusRef.current;

            setMice(prev => {
                if (!prev[mid]) return prev;
                return { ...prev, [mid]: { ...prev[mid], isPressed: true } };
            });
            setTimeout(() => {
                setMice(prev => {
                    if (!prev[mid]) return prev;
                    return { ...prev, [mid]: { ...prev[mid], isPressed: false } };
                });
            }, 100);

            if (data.button === 'right' && (['WAITING', 'BETTING', 'CRASHED'].includes(currentStatus))) {
                setStakes(prev => {
                    const current = prev[mid] || 10;
                    const next = current >= 500 ? 10 : current + 10;
                    return { ...prev, [mid]: next };
                });
            } else if (data.button === 'left') {
                const currentStake = stakesRef.current[mid] || 10;
                if (currentStatus === "BETTING") placeBet(mid, currentStake);
                else if (currentStatus === "IN_FLIGHT") cashout(mid);
            }
        };

        remoteSocket.on("bettingPhase", data => {
            setStatus("BETTING");
            setTimer(data.timer);
            setLiveBets(data.liveBets);
            setCurrentMultiplier(1.0);
            multiplierRef.current = 1.0;
            activeRoundIdRef.current = data.roundId;
            fetchMiceInfo(); // Refresh balances at start of betting
            if (isLoaded) {
                sendMessage("rocket", "React_RestartFresh");
                sendMessage("rocket", "React_StartBetting");
            }
        });

        remoteSocket.on("flightStarted", data => {
            setStatus("IN_FLIGHT");
            setLiveBets(data.liveBets || []);
            activeRoundIdRef.current = data.roundId;
            if (isLoaded) sendMessage("rocket", "React_LaunchRocket", 9999);
        });

        remoteSocket.on("multiplier", data => {
            setCurrentMultiplier(data.multiplier);
            multiplierRef.current = data.multiplier;
            if (isLoaded) sendMessage("rocket", "React_UpdateMultiplier", data.multiplier.toFixed(2) + "x");
        });

        remoteSocket.on("playerCashedOut", data => {
            setLiveBets(p =>
                p.map(b => b.mouseId === data.mouseId
                    ? { ...b, multiplier: data.multiplier, winAmount: data.winAmount }
                    : b
                )
            );
            // ONLY fetch if the mouse that cashed out belongs to this station
            if (miceIdsRef.current.includes(data.mouseId)) {
                fetchMiceInfo();
            }
        });

        remoteSocket.on("crashed", data => {
            setStatus("CRASHED");
            setInitialCrashHistory(data.history);
            activeRoundIdRef.current = "";
            if (isLoaded) sendMessage("rocket", "React_TriggerFlyAway");
            fetchMiceInfo(); // Final refresh for the round
        });

        remoteSocket.on("jackpot:stats",data=>{
            setJackpots(data);
        })

        localSocket.on("status", onStatus);
        localSocket.on("click", onClick);

        return () => {
            localSocket.off("status", onStatus);
            localSocket.off("click", onClick);
            remoteSocket.off("bettingPhase");
            remoteSocket.off("flightStarted");
            remoteSocket.off("multiplier");
            remoteSocket.off("playerCashedOut");
            remoteSocket.off("crashed");
        };
    }, [fetchMiceInfo, registerNewMouse, stationId, isLoaded, sendMessage]);

    return (
        <div className="h-screen w-screen bg-[#061e3d] text-white flex flex-col overflow-hidden select-none uppercase font-sans">
            <style dangerouslySetInnerHTML={{ __html: `.hide-scrollbar::-webkit-scrollbar { display: none; } .hide-scrollbar { scrollbar-width: none; }` }} />

            <div className="flex flex-1 overflow-hidden min-h-0">
                {/* 1. SIDEBAR */}
                <div className="w-80 bg-[#071626] flex flex-col shrink-0 border-r border-white/10 z-20 shadow-2xl">
                    <div className="p-3 bg-[#163a63] border-b border-white/10 shrink-0">
                        <h2 className="text-sm font-black italic text-blue-300">LIVE BETS</h2>
                    </div>
                    <div className="grid grid-cols-4 px-3 py-2 bg-black/40 text-[10px] font-black text-slate-400 border-b border-white/5 shrink-0">
                        <span>USER</span><span className="text-right">BET</span><span className="text-right">MULT</span><span className="text-right">PROFIT</span>
                    </div>
                    <div className="flex-1 overflow-y-auto hide-scrollbar divide-y divide-white/5">
                        {liveBets.map((bet, idx) => (
                            <div key={idx} className={`grid grid-cols-4 items-center px-3 py-4 transition-all ${bet.multiplier ? 'bg-emerald-500/20' : ''}`}>
                                <span className={`text-[13px] font-bold truncate ${bet.multiplier ? 'text-emerald-400' : ''}`}>{bet.customName?.split(' ')[1] || `#${bet.mouseId.slice(-3)}`}</span>
                                <span className="text-[13px] font-black text-right text-slate-300 tabular-nums">{Number(bet.amount).toFixed(0)}</span>
                                <span className="text-[13px] font-black text-right text-[#fbc02d] tabular-nums">{bet.multiplier ? `${bet.multiplier}x` : "-"}</span>
                                <span className={`text-[13px] font-black text-right tabular-nums ${bet.multiplier ? 'text-emerald-400' : 'text-slate-600'}`}>{bet.winAmount || "0"}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 2. GAME AREA */}
                <div className="flex-1 flex flex-col min-w-0">
                    <div className="h-20 bg-[#0a2a4d] flex flex-col shrink-0 border-b border-white/10">
                        <div className="flex-1 flex items-center px-2 gap-1 overflow-hidden">
                            <div ref={historyScrollRef} className="flex gap-1 overflow-x-auto hide-scrollbar scroll-smooth px-2 items-center">
                                {[...initialCrashHistory].reverse().map((game) => (
                                    <div key={game._id} className={`px-4 py-1.5 rounded text-sm font-black italic shrink-0 ${game.crashPoint < 2 ? 'bg-[#9c27b0]' : 'bg-[#00bcd4]'}`}>
                                        {game.crashPoint.toFixed(2)}x
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="h-10 bg-[#163a63] flex items-center justify-between px-10 text-[16px] gap-1 font-black w-full border-t border-white/5 uppercase relative overflow-hidden">
                            <img src="/stars_01.png" className="absolute inset-0 w-full h-full object-cover opacity-30 z-0 pointer-events-none" alt="sky background" />
                            <span className="text-[#00bcd4] relative z-10">BRONZE: {jackpots?.device.poolAmount}</span>
                            <span className="text-[#e53935] relative z-10">SILVER: {jackpots?.silver.poolAmount}</span>
                            <span className="text-[#fbc02d] relative z-10">GOLD: {jackpots?.gold.poolAmount}</span>
                        </div>
                    </div>

                    <div className="flex-1 relative bg-[#0b2b4e] flex items-center justify-center">
                        <div className="absolute inset-0 z-0">
                            <Unity unityProvider={unityProvider} style={{ width: "100%", height: "100%" }} />
                        </div>
                        {status === "BETTING" && (
                            <div className="absolute inset-0 z-50">
                                <BettingTimer timer={timer} status={status} />
                            </div>
                        )}

                    </div>
                </div>
            </div>

            {/* 3. FOOTER (MICE SLOTS) */}
            <div className="h-1/6 bg-[#0a2a4d] flex items-center border-t border-white/20 shrink-0 z-30">
                {Array.from({ length: MAX_SLOTS }).map((_, index) => {
                    const mId = miceIds[index];
                    const mData = mId ? miceData[mId] : null;
                    const mouseState = mId ? mice[mId] : undefined;
                    const isPressed = mouseState?.isPressed;
                    const hasError = mouseState?.error;
                    const notification = mouseState?.notification;
                    const activeBet = liveBets.find(b => b.mouseId === mId);
                    const hasWon = Boolean(activeBet?.multiplier);
                    const hasLost = status === "CRASHED" && activeBet && !activeBet.multiplier;

                    let stateColor = mId ? slotColors[index] : "#1a1a1a";
                    if (hasError) stateColor = "#ef4444";
                    else if (hasWon) stateColor = "#22c55e";
                    else if (hasLost) stateColor = "#b91c1c";
                    else if (activeBet) stateColor = "#fbc02d";

                    return (
                        <div key={index} className="flex-1 h-full flex flex-col border border-white/10 relative overflow-hidden transition-all duration-300" style={{ backgroundColor: mId ? `${stateColor}20` : "#071626" }}>
                            <img src="/stars_01.png" className="absolute inset-0 w-full h-full object-cover opacity-40 z-0 pointer-events-none" alt="bg" />
                            <div className="flex-1 flex items-stretch relative z-10">
                                <div className="w-1/5 flex items-center justify-center text-4xl font-black text-white rounded-br-3xl transition-colors duration-300 z-10" style={{ backgroundColor: stateColor }}>
                                    {index + 1}
                                </div>
                                <div className="flex-1 flex items-center justify-center px-2 relative">
                                    {isPressed && <div className="absolute inset-0 bg-white/20 animate-pulse z-20" />}
                                    {notification && (
                                        <div className="absolute inset-0 z-30 flex items-center justify-center font-black text-white text-[12px] uppercase" style={{ backgroundColor: notification.type === "good" ? "#22c55e" : notification.type === "bad" ? "#ef4444" : "#3b82f6" }}>
                                            {notification.message}
                                        </div>
                                    )}
                                    <div className={`flex items-center gap-4 mt-1 ${notification ? "opacity-0" : "opacity-100"}`}>
                                        <div className="text-center leading-tight">
                                            <div className="text-[10px] font-black uppercase opacity-90">{status === "BETTING" && !activeBet ? "READY" : activeBet && !hasWon ? "PLAY" : "PLAY /"}</div>
                                            <div className="text-[16px] font-black">{hasError ? "LOW" : "JUMP"}</div>
                                        </div>
                                        <img src="/mouse.png" className={`w-12 h-12 object-contain ${mId ? "opacity-100" : "opacity-10 grayscale"}`} alt="mouse" />
                                        <div className="text-center leading-tight">
                                            <div className="text-[10px] font-black opacity-80 uppercase">Level</div>
                                            <div className="text-[16px] font-black">{hasError ? "FUNDS" : "UP"}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="h-max bg-black/60 flex items-center px-2 py-2 gap-2 border-t border-white/5 relative z-10">
                                <div className="flex-1 flex flex-col">
                                    <span className="text-[15px] font-black text-slate-400">BALANCE</span>
                                    <div className="bg-[#121212] rounded px-2 py-1 text-[20px] font-black text-slate-200 border border-white/10 tabular-nums">
                                        KES {mData?.balance?.toFixed(2) || "0.00"}
                                    </div>
                                </div>
                                <div className="flex-1 flex flex-col">
                                    <span className="text-[15px] font-black text-slate-400 uppercase">Stake</span>
                                    <div className="bg-[#121212] rounded px-2 py-1 text-[20px] font-black text-[#fbc02d] border border-white/10 tabular-nums">
                                        KES {(stakes[mId || ""] || 10).toFixed(2)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default GamePlayPage;