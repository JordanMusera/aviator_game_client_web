import { useEffect, useState, useCallback, useRef } from "react";
import { remote_url } from "../constants/api";
import { localSocket, remoteSocket } from "../services/socket";

interface MouseState {
    id: string;
    isPressed: boolean;
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

const GamePlayPage = () => {
    const [mice, setMice] = useState<Record<string, MouseState>>({});
    const [miceIds, setMiceIds] = useState<string[]>([]);
    const [miceData, setMiceData] = useState<Record<string, MouseInfo>>({});
    const [stakes, setStakes] = useState<Record<string, number>>({});
    const [connected, setConnected] = useState(localSocket.connected);
    const [initialCrashHistory, setInitialCrashHistory] = useState<CrashHistoryItem[]>([]);
    const [status, setStatus] = useState<'WAITING' | 'BETTING' | 'IN_FLIGHT' | 'CRASHED'>('WAITING');
    const [timer, setTimer] = useState<number | null>(null);
    const [multiplier, setMultiplier] = useState<number>(1.00);
    const [liveBets, setLiveBets] = useState<LiveBet[]>([]);
    const [activeRoundId, setActiveRoundId] = useState<string>("");

    const flightData = useRef<{startTime:number}|null>(null);
    const requestRef = useRef<number>(0);
    const miceDataRef = useRef<Record<string, MouseInfo>>({});
    const historyEndRef = useRef<HTMLDivElement>(null);

    // REFS to prevent stale closures in socket event listeners
    const statusRef = useRef(status);
    const stakesRef = useRef<Record<string, number>>({});
    const activeRoundIdRef = useRef("");
    const multiplierRef = useRef(1.00);

    const token = localStorage.getItem('token');
    const stationId = localStorage.getItem('stationId');

    const slotColors = ["#facc15", "#10b981", "#ef4444", "#7e22ce", "#64748b", "#ec4899", "#0ea5e9"];

    // Keep status ref in sync
    useEffect(() => {
        statusRef.current = status;
    }, [status]);

    // Auto-scroll to the right whenever history updates
    useEffect(() => {
        if (historyEndRef.current) {
            historyEndRef.current.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "end" });
        }
    }, [initialCrashHistory]);

    const fetchMiceInfo = useCallback(async () => {
        try {
            const request = await fetch(`${remote_url}/api/v1/device/info`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                }
            });
            const response = await request.json();

            if (response.success && response.mice) {
                const infoMap: Record<string, MouseInfo> = {};
                const currentStakes = { ...stakesRef.current };

                response.mice.forEach((m: MouseInfo) => {
                    infoMap[m.mouseId] = m;
                    // Initialize stake to 10 if it doesn't exist
                    if (currentStakes[m.mouseId] === undefined) {
                        currentStakes[m.mouseId] = 10.00;
                    }
                });

                setMiceData(infoMap);
                miceDataRef.current = infoMap;
                setStakes(currentStakes);
                stakesRef.current = currentStakes;
            }
        } catch (error) {
            console.error("Fetch mice info failed", error);
        }
    }, [token]);

    const registerNewMouse = useCallback(async (id: string) => {
        try {
            const res = await fetch(`${remote_url}/api/v1/device/add-mouse`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ mice: [id] })
            });
            if (res.ok) fetchMiceInfo();
        } catch (error) {
            console.error("Failed to register new mouse:", id, error);
        }
    }, [token, fetchMiceInfo]);

    const placeBet = async (mouseId: string, stake: number) => {
        const rId = activeRoundIdRef.current; // Use Ref
        if (!rId) return;

        await fetch(`${remote_url}/api/v1/device/bet`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({
                mouseId,
                betAmount: stake,
                roundId: rId
            })
        });
    }

    const cashout = async (mouseId: string) => {
        const rId = activeRoundIdRef.current; // Use Ref
        const mult = multiplierRef.current;   // Use Ref
        if (!rId) return;

        await fetch(`${remote_url}/api/v1/device/cash-out`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({
                mouseId,
                claimMultiplier: mult,
                roundId: rId
            })
        });
    }

    useEffect(() => {
        fetchMiceInfo();

        const onConnect = () => setConnected(true);
        const onDisconnect = () => {
            setConnected(false);
            setMice({});
            setMiceIds([]);
        };

        remoteSocket.emit('joinStation', stationId);

        const onStatus = (data: { event: string; id: string }) => {
            if (data.event === 'connected') {
                setMice(prev => ({ ...prev, [data.id]: { id: data.id, isPressed: false } }));
                setMiceIds(prev => prev.includes(data.id) ? prev : [...prev, data.id]);

                if (!miceDataRef.current[data.id]) {
                    registerNewMouse(data.id);
                }
            } else {
                setMice(prev => {
                    const next = { ...prev };
                    delete next[data.id];
                    return next;
                });
                setMiceIds(prev => prev.filter(mid => mid !== data.id));
            }
        };

        const onClick = (data: { id: string, button: string }) => {
            const mid = data.id;
            const currentStatus = statusRef.current;

            // 1. VISUAL FEEDBACK
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

            // 2. LOGIC BASED ON BUTTON
            if (data.button === 'right' && (currentStatus === 'WAITING' || currentStatus === 'BETTING' || currentStatus === 'CRASHED')) {
                setStakes(prev => {
                    const current = prev[mid] || 10;
                    const next = current >= 500 ? 10 : current + 10;
                    const updated = { ...prev, [mid]: next };
                    stakesRef.current = updated;
                    return updated;
                });
            }
            else if (data.button === 'left') {
                const currentStake = stakesRef.current[mid] || 10;
                if (currentStatus === "BETTING") {
                    placeBet(mid, currentStake);
                } else if (currentStatus === "IN_FLIGHT") {
                    cashout(mid);
                }
            }
        };

        const bettingPhaseFn = (data: any) => {
            setStatus("BETTING");
            setTimer(data.timer);
            setMultiplier(1.00);
            multiplierRef.current = 1.00; // Sync Ref
            setActiveRoundId(data.roundId);
            activeRoundIdRef.current = data.roundId; // Sync Ref
            setLiveBets(data.liveBets || []);
        }

        const playerCashedOutFn = (data: any) => {
            setLiveBets(prev => prev.map(bet =>
                bet.mouseId === data.mouseId ? { ...bet, multiplier: data.multiplier, winAmount: data.winAmount } : bet
            ));

            const newStake = parseFloat(data.winAmount);
            setStakes(prev => {
                const cappedStake = newStake > 500 ? 500 : newStake;
                const updated = { ...prev, [data.mouseId]: cappedStake };
                stakesRef.current = updated;
                return updated;
            });
        }

        const crashedFn = (data: any) => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
            flightData.current = null;
            setStatus("CRASHED");
            setMultiplier(parseFloat(data.finalMultiplier));
            multiplierRef.current = parseFloat(data.finalMultiplier);
            setInitialCrashHistory(data.history);
        }

        const flightStartedFn = (data: any) => {
            setStatus("IN_FLIGHT");
            setActiveRoundId(data.roundId);
            activeRoundIdRef.current = data.roundId; // Sync Ref
            setLiveBets(data.liveBets || []);
            flightData.current = { startTime: data.startTime };
        }

        const updateMultiplier = (data: any) => {
            setMultiplier(data.multiplier);
            multiplierRef.current = data.multiplier; // Sync Ref
        };

        const updateBalanceFn = (data: any) => {
            setMiceData(prev => {
                if (!prev[data.mouseId]) return prev;
                const updated = {
                    ...prev,
                    [data.mouseId]: { ...prev[data.mouseId], balance: data.newBalance }
                };
                miceDataRef.current = updated;
                return updated;
            });
        }

        localSocket.on('connect', onConnect);
        localSocket.on('disconnect', onDisconnect);
        localSocket.on('status', onStatus);
        localSocket.on('click', onClick);
        remoteSocket.on('initialHistory', (data) => setInitialCrashHistory(data));
        remoteSocket.on('bettingPhase', bettingPhaseFn);
        remoteSocket.on('playerCashedOut', playerCashedOutFn);
        remoteSocket.on('crashed', crashedFn);
        remoteSocket.on('flightStarted', flightStartedFn);
        remoteSocket.on('multiplier', updateMultiplier);
        remoteSocket.on('balanceUpdate', updateBalanceFn);

        return () => {
            localSocket.off('connect', onConnect);
            localSocket.off('disconnect', onDisconnect);
            localSocket.off('status', onStatus);
            localSocket.off('click', onClick);
            remoteSocket.off('initialHistory');
            remoteSocket.off('bettingPhase', bettingPhaseFn);
            remoteSocket.off('playerCashedOut', playerCashedOutFn);
            remoteSocket.off('crashed', crashedFn);
            remoteSocket.off('flightStarted', flightStartedFn);
            remoteSocket.off('multiplier', updateMultiplier);
            remoteSocket.off('balanceUpdate', updateBalanceFn);
        };
    }, [fetchMiceInfo, registerNewMouse, token, stationId]);

    const sortedMiceIds = [...miceIds].sort((a, b) => {
        const nameA = miceData[a]?.customName || "";
        const nameB = miceData[b]?.customName || "";
        return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
    });

    return (
        <div className="h-screen bg-[#0b0b0e] text-slate-200 font-sans flex flex-col overflow-hidden selection:bg-red-500/30">
            <style dangerouslySetInnerHTML={{ __html: `
                .hide-scrollbar::-webkit-scrollbar { display: none; }
                .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}} />

            {/* Top Navigation Bar */}
            <div className="h-14 border-b border-white/5 bg-[#121117] flex items-center justify-between px-6 shrink-0 z-10">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-red-600 rounded flex items-center justify-center shadow-[0_0_15px_rgba(225,29,72,0.4)]">
                        <span className="text-white font-black italic tracking-tighter">A</span>
                    </div>
                    <h1 className="text-lg font-black uppercase tracking-tighter text-white">
                        Aviator <span className="text-red-600">Pro</span> Console
                    </h1>
                </div>
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10">
                        <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]' : 'bg-red-600'}`} />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            {connected ? "Server Live" : "Offline"}
                        </span>
                    </div>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* --- LIVE BETS SIDEBAR --- */}
                <div className="w-80 border-r border-white/5 bg-[#0b0b0e] flex flex-col shrink-0">
                    <div className="p-4 border-b border-white/5 bg-[#121117]/80 backdrop-blur-md">
                        <div className="flex items-center justify-between">
                            <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                <span className="w-1 h-3 bg-red-600 rounded-full shadow-[0_0_8px_rgba(225,29,72,0.5)]" />
                                All Bets
                            </h2>
                            <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-[10px] font-bold text-white tabular-nums bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
                                    {liveBets.length}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex px-4 py-2 bg-black/40 border-b border-white/5 text-[9px] font-black uppercase tracking-widest text-slate-500">
                        <span className="flex-1">User</span>
                        <span className="w-14 text-right">Bet</span>
                        <span className="w-16 text-right">Mult</span>
                        <span className="w-20 text-right">Cash Out</span>
                    </div>

                    <div className="flex-1 overflow-y-auto hide-scrollbar bg-black/20">
                        {liveBets.map((bet, idx) => {
                            const hasCashedOut = !!bet.multiplier;
                            return (
                                <div key={idx} className={`flex items-center px-4 py-2 transition-all duration-300 ${hasCashedOut ? 'bg-emerald-500/[0.04]' : ''}`}>
                                    <div className="flex-1 flex items-center gap-2 overflow-hidden">
                                        <span className={`text-[10px] font-bold truncate ${hasCashedOut ? 'text-emerald-400' : 'text-slate-400'}`}>
                                            {bet.customName ?? bet.mouseId}
                                        </span>
                                    </div>
                                    <div className="w-14 text-right">
                                        <span className="text-[11px] font-mono font-bold text-slate-500">
                                            ${Number(bet.amount).toFixed(0)}
                                        </span>
                                    </div>
                                    <div className="w-16 text-right">
                                        {hasCashedOut ? (
                                            <span className="text-[10px] font-black bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded border border-emerald-500/20 tabular-nums">
                                                {bet.multiplier}x
                                            </span>
                                        ) : (
                                            <span className="text-[10px] font-bold text-slate-700 italic">...</span>
                                        )}
                                    </div>
                                    <div className="w-20 text-right">
                                        {hasCashedOut ? (
                                            <span className="text-[11px] font-black text-emerald-400 tabular-nums">
                                                ${bet.winAmount}
                                            </span>
                                        ) : (
                                            <div className="flex justify-end"><div className="h-1 w-8 bg-white/5 rounded-full animate-pulse" /></div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {activeRoundId && (
                        <div className="p-4 bg-[#121117] border-t border-white/5">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-[9px] text-slate-500 font-black uppercase tracking-tighter">Round Hash</span>
                                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-white/5 text-slate-500 border border-white/10">PROVABLY FAIR</span>
                            </div>
                            <div className="text-[10px] font-mono text-slate-500 truncate bg-black/40 p-2 rounded border border-white/5">
                                {activeRoundId}
                            </div>
                        </div>
                    )}
                </div>

                {/* Main Arena Area */}
                <div className="flex-1 flex flex-col bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#1a1921] to-[#0b0b0e] overflow-hidden">
                    <div className="w-full bg-black/20 border-b border-white/5 px-4 shrink-0 overflow-x-auto hide-scrollbar">
                        <div className="flex gap-2 py-4 scroll-smooth">
                            {[...initialCrashHistory].reverse().map((game) => (
                                <div
                                    key={game._id}
                                    className={`px-3 py-1 rounded-md text-[11px] font-black border transition-all shrink-0 ${
                                        game.crashPoint < 2
                                            ? 'bg-red-500/10 border-red-500/30 text-red-500'
                                            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                                    }`}
                                >
                                    {game.crashPoint.toFixed(2)}x
                                </div>
                            ))}
                            <div ref={historyEndRef} />
                            <div ref={historyEndRef} />
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col items-center justify-center relative p-6">
                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 pointer-events-none" />
                        <div className="w-full h-full bg-[#121117]/40 rounded-[2rem] border border-white/5 shadow-2xl relative flex flex-col items-center justify-center">
                            {status === "BETTING" ? (
                                <div className="text-amber-500 text-8xl font-black italic tracking-tighter animate-pulse">{timer?.toString().padStart(2, '0')}</div>
                            ) : (
                                <div className="text-red-600 text-[10rem] font-black italic tracking-tighter leading-none animate-pulse">{multiplier.toFixed(2)}x</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* --- BOTTOM HARDWARE INTERFACE (MATCHING SCREENSHOT) --- */}
            <div className="h-max w-full shrink-0 bg-[#08080a] border-t border-white/10 px-4 py-3 flex flex-col overflow-hidden">
                <div className="flex-1 flex flex-nowrap gap-3 overflow-x-auto overflow-y-hidden pb-2 hide-scrollbar">
                    {sortedMiceIds.map((id, index) => {
                        const mouse = mice[id];
                        const data = miceData[id];
                        const currentStake = stakes[id] || 10.00;
                        const color = slotColors[index % slotColors.length];
                        const displayIndex = data?.customName?.split(' ')[1] || (index + 1);

                        // Status logic for screenshot design
                        const currentBet = liveBets.find(b => b.mouseId === id);
                        const isWinner = !!currentBet?.multiplier;
                        const hasBet = !!currentBet;

                        if (!mouse) return null;

                        return (
                            <div key={id} className="flex flex-col gap-1.5 shrink-0">

                                {/* Terminal Card */}
                                <div className={`w-[240px] flex flex-col rounded-md border-2 overflow-hidden transition-all duration-75 select-none h-max bg-[#12161b] ${mouse.isPressed ? 'scale-[0.97] brightness-125' : ''}`} style={{ borderColor: color }}>

                                    {/* Top Status Area */}
                                    <div className="flex h-1/2 border-b border-white/5 relative">
                                        <div style={{ backgroundColor: color }} className="w-12 flex items-center justify-center text-4xl font-black italic text-black/90">
                                            {displayIndex}
                                        </div>

                                        <div className="flex-1 flex items-center justify-center relative bg-slate-900/40">
                                            {/* Logic for Status Badges from Screenshot */}
                                            {status === 'CRASHED' && hasBet && !isWinner && (
                                                <div className="absolute inset-0 bg-red-600 flex flex-col items-center justify-center">
                                                    <span className="text-2xl font-black italic">LOST</span>
                                                </div>
                                            )}
                                            {isWinner && (
                                                <div className="absolute inset-0 bg-emerald-600 flex flex-col items-center justify-center">
                                                    <span className="text-2xl font-black italic leading-none">WON</span>
                                                </div>
                                            )}
                                            {hasBet && !isWinner && status !== 'CRASHED' && (
                                                <div className="absolute inset-0 bg-yellow-500 flex flex-col items-center justify-center">
                                                    <span className="text-2xl font-black text-black italic leading-none">BET PLACED</span>
                                                </div>
                                            )}

                                            {/* Control Icons */}
                                            <div className="flex items-center gap-4">
                                                <div className="flex flex-col items-center gap-1">
                                                    <span className="text-[10px] font-bold text-white uppercase opacity-70">Play/Jump</span>
                                                    <div className="w-5 h-7 border-2 border-white/40 rounded-full relative">
                                                        <div className="absolute top-1 left-1/2 -translate-x-1/2 w-1.5 h-2 bg-white/40 rounded-sm" />
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-center gap-1">
                                                    <span className="text-[10px] font-bold text-white uppercase opacity-70">Level Up</span>
                                                    <div className="w-5 h-7 border-2 border-white/40 rounded-full relative">
                                                        <div className="absolute top-1 left-1/2 -translate-x-1/2 w-1.5 h-2 bg-white/40 rounded-sm" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Bottom Data Area */}
                                    <div className="flex-1 flex p-2 gap-2 bg-[#0a0d10]">
                                        <div className="flex-1 flex flex-col">
                                            <label className="text-[10px] font-black text-slate-500 uppercase italic">Balance</label>
                                            <div className="text-[16px] font-black text-white tabular-nums border-b border-white/10 pb-0.5">
                                                {data?.balance?.toFixed(2) || "0.00"}
                                            </div>
                                        </div>
                                        <div className="flex-1 flex flex-col">
                                            <label className="text-[10px] font-black text-slate-500 uppercase italic">Player Level</label>
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

export default GamePlayPage;