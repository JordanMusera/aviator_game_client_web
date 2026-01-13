import { useEffect, useState, useCallback, useRef } from "react";
import { remote_url } from "../constants/api";
import { localSocket, remoteSocket } from "../services/socket";
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

/* ================= COMPONENT ================= */
const PlayPage = () => {
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

    /* ---------- REFS ---------- */
    const statusRef = useRef(status);
    const stakesRef = useRef<Record<string, number>>({});
    const miceDataRef = useRef<Record<string, MouseInfo>>({});
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

    useEffect(() => {
        if (historyScrollRef.current) {
            historyScrollRef.current.scrollLeft = historyScrollRef.current.scrollWidth;
        }
    }, [initialCrashHistory]);

    const ERROR_TIMEOUT = 1000;
    const PRESS_TIMEOUT = 90;
    const DEFAULT_STAKE = 10;
    const MAX_STAKE = 500;


    /* ================= API ================= */
    const fetchMiceInfo = useCallback(async () => {
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



//////////////////////////////////////////////////////////////////////////////////////
    const miceRef = useRef<Record<string, MouseState>>({});
    useEffect(() => {
        miceRef.current = mice;
    }, [mice]);

    const [mouseNotification, setMouseNotification] = useState<{
        type: 'success' | 'error' | 'info';
        message: string;
    } | null>(null);


    const NOTIFICATION_TIMEOUT = 1200;

    const showNotification = (
        mouseId: string,
        type: 'good' | 'bad' | 'info',
        message: string
    ) => {
        setMice(prev => ({
            ...prev,
            [mouseId]: {
                ...prev[mouseId],
                notification: { type, message }
            }
        }));

        setTimeout(() => {
            setMice(prev => ({
                ...prev,
                [mouseId]: {
                    ...prev[mouseId],
                    notification: undefined
                }
            }));
        }, NOTIFICATION_TIMEOUT);
    };


    const triggerMouseError = (mouseId: string, message = "LOW FUNDS") => {
        showNotification(mouseId, "bad", message);
    };

////////////////////////////////////////////////////////////

    const placeBet = async (mouseId: string, amount: number) => {
        if (!activeRoundIdRef.current) return;
        await fetch(`${remote_url}/api/v1/device/bet`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer " + token,
            },
            body: JSON.stringify({
                mouseId,
                betAmount: amount,
                roundId: activeRoundIdRef.current,
            }),
        });
    };

    const cashout = async (mouseId: string) => {
        if (!activeRoundIdRef.current) return;
        await fetch(`${remote_url}/api/v1/device/cash-out`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer " + token,
            },
            body: JSON.stringify({
                mouseId,
                claimMultiplier: multiplierRef.current,
                roundId: activeRoundIdRef.current,
            }),
        });
    };

    /* ================= SOCKETS ================= */
    useEffect(() => {
        fetchMiceInfo();
        remoteSocket.emit("joinStation", stationId);

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

        const onClick = (data: { id: string; button: string }) => {
            const mid = data.id;

            // ❌ mouse not registered yet
            if (!miceRef.current[mid]) return;

            const balance = miceDataRef.current[mid]?.balance ?? 0;
            const currentStake = stakesRef.current[mid] ?? DEFAULT_STAKE;
            const status = statusRef.current;

            /* PRESS FEEDBACK */
            setMice(prev => ({
                ...prev,
                [mid]: { ...prev[mid], isPressed: true }
            }));

            setTimeout(() => {
                setMice(prev => ({
                    ...prev,
                    [mid]: { ...prev[mid], isPressed: false }
                }));
            }, PRESS_TIMEOUT);

            /* RIGHT CLICK → STAKE CHANGE */
            if (data.button === "right") {
                if (status === "IN_FLIGHT") return;

                const nextStake =
                    currentStake >= MAX_STAKE ? DEFAULT_STAKE : currentStake + 10;

                if (balance < nextStake) {
                    triggerMouseError(mid, "INSUFFICIENT BALANCE");
                    return;
                }

                setStakes(prev => {
                    const updated = { ...prev, [mid]: nextStake };
                    stakesRef.current = updated;
                    return updated;
                });

                showNotification(mid, "info", `STAKE ${nextStake}`);
                return;
            }

            /* LEFT CLICK ONLY */
            if (data.button !== "left") return;

            /* PLACE BET */
            if (status === "BETTING") {
                const alreadyBet = liveBets.some(b => b.mouseId === mid);
                if (alreadyBet) return;

                if (balance < currentStake) {
                    triggerMouseError(mid, "LOW BALANCE");
                    return;
                }

                placeBet(mid, currentStake);
                showNotification(mid, "info", "BET PLACED");
                return;
            }

            /* CASHOUT */
            if (status === "IN_FLIGHT") {
                const hasBet = liveBets.some(b => b.mouseId === mid);
                if (!hasBet) return;

                cashout(mid);
                showNotification(mid, "good", "CASHED OUT");
            }
        };



        remoteSocket.on("bettingPhase", data => {
            setStatus("BETTING");
            setTimer(data.timer);
            setLiveBets([]);
            setCurrentMultiplier(1.0);
            multiplierRef.current = 1.0;
            activeRoundIdRef.current = data.roundId;
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
            fetchMiceInfo();
        });

        remoteSocket.on("crashed", data => {
            setStatus("CRASHED");
            setInitialCrashHistory(data.history);
            activeRoundIdRef.current = "";
            if (isLoaded) sendMessage("rocket", "React_TriggerFlyAway");
            fetchMiceInfo();
        });

        localSocket.on("status", onStatus);
        localSocket.on("click", onClick);

        return () => {
            localSocket.off("status", onStatus);
            localSocket.off("click", onClick);
            remoteSocket.removeAllListeners();
        };
    }, [fetchMiceInfo, registerNewMouse, stationId, isLoaded, sendMessage]);

    const sortedMiceIds = [...miceIds].sort((a, b) => {
        const nameA = miceData[a]?.customName || "";
        const nameB = miceData[b]?.customName || "";
        return nameA.localeCompare(nameB, undefined, {
            numeric: true,
            sensitivity: 'base',
        });
    });


    return (
        <div className="h-screen w-screen bg-[#061e3d] text-white flex flex-col overflow-hidden select-none uppercase font-sans">
            <style dangerouslySetInnerHTML={{ __html: `.hide-scrollbar::-webkit-scrollbar { display: none; } .hide-scrollbar { scrollbar-width: none; }` }} />

            {/* UPPER ROW: SIDEBAR + GAME */}
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
                            <span className="text-[#00bcd4] relative z-10">BRONZE: 119.84</span>
                            <span className="text-[#e53935] relative z-10">SILVER: 57.56</span>
                            <span className="text-[#fbc02d] relative z-10">GOLD: 150.27</span>
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

            {/* --- BOTTOM HARDWARE INTERFACE --- */}
            <div className="h-max w-full shrink-0 bg-[#08080a] border-t border-white/10 px-4 py-3 flex flex-col overflow-hidden">
                <div className="flex-1 flex flex-nowrap gap-3 overflow-x-auto overflow-y-hidden pb-2 hide-scrollbar">
                    {sortedMiceIds.map((id, index) => {
                        const mouse = mice[id];
                        const data = miceData[id];
                        const currentStake = stakes[id] || 10.00;
                        const color = slotColors[index % slotColors.length];
                        const displayIndex = data?.customName?.split(' ')[1] || (index + 1);

                        const currentBet = liveBets.find(b => b.mouseId === id);
                        const isWinner = !!currentBet?.multiplier;
                        const hasBet = !!currentBet;

                        if (!mouse) return null;

                        return (
                            <div key={id} className="flex flex-col gap-1.5 shrink-0">

                                {/* Terminal Card */}
                                <div
                                    className={`w-[240px] flex flex-col rounded-md border-2 overflow-hidden transition-all duration-75 select-none bg-[#12161b]
                        ${mouse.isPressed ? 'scale-[0.97] brightness-125' : ''}`}
                                    style={{ borderColor: color }}
                                >

                                    {/* ================= TOP SECTION ================= */}
                                    <div className="flex h-1/2 border-b border-white/5 relative">

                                        {/* LEFT SLOT */}
                                        <div
                                            style={{ backgroundColor: color }}
                                            className="w-12 flex items-center justify-center text-4xl font-black italic text-black/90"
                                        >
                                            {displayIndex}
                                        </div>

                                        {/* RIGHT AREA */}
                                        <div className="flex-1 relative">

                                            {/* 🔔 NOTIFICATION MODE (REPLACES EVERYTHING) */}
                                            {mouseNotification ? (
                                                <div
                                                    className={`absolute inset-0 flex items-center justify-center
                                        ${
                                                        mouseNotification.type === 'success'
                                                            ? 'bg-emerald-600'
                                                            : mouseNotification.type === 'error'
                                                                ? 'bg-red-600'
                                                                : 'bg-blue-600'
                                                    }`}
                                                >
                                        <span className="text-2xl font-black italic text-white text-center px-2">
                                            {mouseNotification.message}
                                        </span>
                                                </div>
                                            ) : (
                                                <>
                                                    {/* ❌ LOST */}
                                                    {status === 'CRASHED' && hasBet && !isWinner && (
                                                        <div className="absolute inset-0 bg-red-600 flex items-center justify-center">
                                                            <span className="text-2xl font-black italic">LOST</span>
                                                        </div>
                                                    )}

                                                    {/* ✅ WON */}
                                                    {isWinner && (
                                                        <div className="absolute inset-0 bg-emerald-600 flex items-center justify-center">
                                                            <span className="text-2xl font-black italic">WON</span>
                                                        </div>
                                                    )}

                                                    {/* 🟡 BET PLACED */}
                                                    {hasBet && !isWinner && status !== 'CRASHED' && (
                                                        <div className="absolute inset-0 bg-yellow-500 flex items-center justify-center">
                                                <span className="text-2xl font-black italic text-black">
                                                    BET PLACED
                                                </span>
                                                        </div>
                                                    )}

                                                    {/* DEFAULT CONTROLS */}
                                                    {!hasBet && (
                                                        <div className="flex items-center justify-center h-full gap-6 bg-slate-900/40">
                                                            <div className="flex flex-col items-center gap-1">
                                                    <span className="text-[10px] font-bold uppercase opacity-70">
                                                        Play / Jump
                                                    </span>
                                                                <div className="w-5 h-7 border-2 border-white/40 rounded-full relative">
                                                                    <div className="absolute top-1 left-1/2 -translate-x-1/2 w-1.5 h-2 bg-white/40 rounded-sm" />
                                                                </div>
                                                            </div>

                                                            <div className="flex flex-col items-center gap-1">
                                                    <span className="text-[10px] font-bold uppercase opacity-70">
                                                        Level Up
                                                    </span>
                                                                <div className="w-5 h-7 border-2 border-white/40 rounded-full relative">
                                                                    <div className="absolute top-1 left-1/2 -translate-x-1/2 w-1.5 h-2 bg-white/40 rounded-sm" />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* ================= BOTTOM DATA ================= */}
                                    <div className="flex-1 flex p-2 gap-2 bg-[#0a0d10]">
                                        <div className="flex-1 flex flex-col">
                                            <label className="text-[10px] font-black text-slate-500 uppercase italic">
                                                Balance
                                            </label>
                                            <div className="text-[16px] font-black text-white tabular-nums border-b border-white/10 pb-0.5">
                                                {data?.balance?.toFixed(2) || "0.00"}
                                            </div>
                                        </div>

                                        <div className="flex-1 flex flex-col">
                                            <label className="text-[10px] font-black text-slate-500 uppercase italic">
                                                Player Level
                                            </label>
                                            <div className="text-[16px] font-black text-white tabular-nums border-b border-white/10 pb-0.5">
                                                {currentStake.toFixed(2)}
                                            </div>
                                        </div>
                                    </div>

                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>






        </div>
    );
};

export default PlayPage;