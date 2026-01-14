import { useEffect, useState, useCallback, useRef } from "react";
import { remote_url } from "../constants/api";
import { localSocket, pc_id, remoteSocket } from "../services/socket";
import { Unity, useUnityContext } from "react-unity-webgl";
import BettingTimer from "../components/BettingTimer";

interface MouseState {
    id: string;
    isPressed: boolean;
    notification?: {
        type: 'Bet Placed' | 'Awaiting Cashout' | 'Cashing Out' | 'Won' | 'Lost'|'info';
        message: string;
    } | null;
}

interface MouseInfo { mouseId: string; balance: number; active: boolean; customName?: string; }
interface CrashHistoryItem { _id: string; crashPoint: number; }
interface LiveBet { mouseId: string; amount: number; multiplier?: string; winAmount?: string; }
interface Jackpot { device: any; silver: any; gold: any; }

const GamePlayPage = () => {
    const [mice, setMice] = useState<Record<string, MouseState>>({});
    const [miceIds, setMiceIds] = useState<string[]>([]);
    const [miceData, setMiceData] = useState<Record<string, MouseInfo>>({});
    const [stakes, setStakes] = useState<Record<string, number>>({});
    const [initialCrashHistory, setInitialCrashHistory] = useState<CrashHistoryItem[]>([]);
    const [status, setStatus] = useState<'WAITING' | 'BETTING' | 'IN_FLIGHT' | 'CRASHED'>('WAITING');
    const [timer, setTimer] = useState<number | null>(null);
    const [liveBets, setLiveBets] = useState<LiveBet[]>([]);
    const [currentMultiplier, setCurrentMultiplier] = useState<number>(1.00);
    const [jackpots, setJackpots] = useState<Jackpot>({ device: { amount: 0 }, gold: { amount: 0 }, silver: { amount: 0 } });
    const [maxStake,setMaxStake] = useState(500);
    const [bonusPercentage, setBonusPercentage] = useState(0);


    const statusRef = useRef(status);
    const stakesRef = useRef(stakes);
    const miceRef = useRef(mice);
    const miceDataRef = useRef(miceData);
    const miceIdsRef = useRef(miceIds);
    const activeRoundIdRef = useRef("");
    const multiplierRef = useRef(currentMultiplier);
    const historyScrollRef = useRef<HTMLDivElement>(null);
    const maxStakeRef = useRef(maxStake)
    const bonusPercentageRef=useRef(bonusPercentage);

    const MAX_SLOTS = 6;
    const token = localStorage.getItem("token");
    const stationId = localStorage.getItem("stationId");
    const slotColors = ["#ef4444", "#22c55e", "#3b82f6", "#64748b", "#f59e0b"];

    const { unityProvider, isLoaded, sendMessage } = useUnityContext({
        loaderUrl: "/unity-build/web_game.loader.js",
        dataUrl: "/unity-build/web_game.data.unityweb",
        frameworkUrl: "/unity-build/web_game.framework.js.unityweb",
        codeUrl: "/unity-build/web_game.wasm.unityweb",
    });

    useEffect(() => { statusRef.current = status; }, [status]);
    useEffect(() => { stakesRef.current = stakes; }, [stakes]);
    useEffect(() => { miceRef.current = mice; }, [mice]);
    useEffect(() => { miceDataRef.current = miceData; }, [miceData]);
    useEffect(() => { miceIdsRef.current = miceIds; }, [miceIds]);
    useEffect(() => { maxStakeRef.current = maxStake; }, [maxStake]);
    useEffect(() => { bonusPercentageRef.current = bonusPercentage}, [bonusPercentage]);

    useEffect(() => {
        if (historyScrollRef.current) {
            historyScrollRef.current.scrollLeft = historyScrollRef.current.scrollWidth;
        }
    }, [initialCrashHistory]);

    const fetchMiceInfo = useCallback(async () => {
        if (!token) return;
        try {
            const res = await fetch(`${remote_url}/api/v1/device/info`, { headers: { Authorization: "Bearer " + token } });
            const json = await res.json();
            if (json.success && json.mice) {
                const map: Record<string, MouseInfo> = {};

                setStakes(prev => {
                    const updatedStakes = { ...prev };
                    json.mice.forEach((m: MouseInfo) => {
                        map[m.mouseId] = m;
                        // If no stake exists yet (initial load), or current stake > balance
                        const currentStake = prev[m.mouseId] || 10;
                        if (m.balance < currentStake) {
                            updatedStakes[m.mouseId] = m.balance;
                        } else if (!prev[m.mouseId]) {
                            // Default to 10 only if balance allows it
                            updatedStakes[m.mouseId] = m.balance < 10 ? m.balance : 10;
                        }
                    });
                    return updatedStakes;
                });

                setMiceData(map);
            }
        } catch (e) { console.error(e); }
    }, [token]);

    const plugMouse = useCallback(async (id: string) => {
        await fetch(`${remote_url}/api/v1/device/add-mouse`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
            body: JSON.stringify({ mice: [id] }),
        });
        fetchMiceInfo();
    }, [token, fetchMiceInfo]);

    const removeMouse=async(mouseId:string)=>{
        await fetch(`${remote_url}/api/v1/device/remove-mouse`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
            body: JSON.stringify({ mouseId })
        });
    }

    const placeBet = async (mouseId: string, amount: number) => {
        if (!activeRoundIdRef.current) return;

        const balance = miceDataRef.current[mouseId]?.balance || 0;

        // 1. Check for 0 balance
        if (balance <= 0) {
            setMice(prev => ({
                ...prev,
                [mouseId]: {
                    ...prev[mouseId],
                    notification: { type: 'Lost', message: 'INSUFFICIENT BALANCE' }
                }
            }));

            // Clear the error message after 2 seconds
            setTimeout(() => {
                setMice(prev => {
                    if (prev[mouseId]?.notification?.message === 'INSUFFICIENT BALANCE') {
                        return { ...prev, [mouseId]: { ...prev[mouseId], notification: null } };
                    }
                    return prev;
                });
            }, 2000);
            return;
        }

        // 2. If balance < 10, stake the remaining balance.
        // Otherwise, ensure they don't stake more than they have.
        const finalAmount = balance < 10 ? balance : Math.min(amount, balance);

        remoteSocket.emit("placeBet", {
            deviceId: pc_id,
            mouseId,
            amount: finalAmount,
            roundId: activeRoundIdRef.current
        });

        setMice(prev => ({
            ...prev,
            [mouseId]: {
                ...prev[mouseId],
                notification: { type: 'Bet Placed', message: 'BET PLACED' }
            }
        }));
    };

    const cashout = async (mouseId: string) => {
        if (!activeRoundIdRef.current) return;
        setMice(prev => ({ ...prev, [mouseId]: { ...prev[mouseId], notification: { type: 'Cashing Out', message: 'CASHING OUT...' } } }));
        remoteSocket.emit("cashoutBet", { deviceId: pc_id, mouseId, multiplier: multiplierRef.current, roundId: activeRoundIdRef.current });
    };

    useEffect(() => {
        if (!stationId) return;
        remoteSocket.emit("joinDeviceSession", { stationId, deviceId: pc_id });

        const onStatus = (data: { event: string; id: string }) => {
            if (data.event === "connected") {
                setMice(prev => ({ ...prev, [data.id]: { id: data.id, isPressed: false, notification: null } }));
                setMiceIds(prev => prev.includes(data.id) ? prev : [...prev, data.id].slice(0, MAX_SLOTS));
                plugMouse(data.id);
            } else {
                removeMouse(data.id);
                setMiceIds(prev => prev.filter(id => id !== data.id)); }
        };

        const onClick = (data: { id: string, button: string }) => {
            const mid = data.id;
            const currentStatus = statusRef.current;

            setMice(prev => (prev[mid] ? { ...prev, [mid]: { ...prev[mid], isPressed: true } } : prev));
            setTimeout(() => setMice(prev => (prev[mid] ? { ...prev, [mid]: { ...prev[mid], isPressed: false } } : prev)), 100);

            const currentBalance = miceDataRef.current[mid]?.balance || 0;

            if (data.button === 'right' && (['WAITING', 'BETTING', 'CRASHED'].includes(currentStatus))) {
                if (!miceRef.current[mid]?.notification) {
                    const currentBalance = miceDataRef.current[mid]?.balance || 0;
                    const currentStake = stakesRef.current[mid] || 10;

                    // Determine the next increment
                    let nextStakeValue = currentStake + 10;

                    // LOGIC:
                    // 1. If we exceed the global maxStake OR we are already at/above our balance: Reset to 10
                    // 2. If the next +10 step would exceed our balance: Jump exactly to the balance
                    if (currentStake >= maxStakeRef.current || currentStake >= currentBalance) {
                        nextStakeValue = 10;
                    } else if (nextStakeValue > currentBalance) {
                        nextStakeValue = currentBalance;
                    }

                    // Final check: if 10 is still greater than balance (e.g., user has 5 KES)
                    // ensure we don't set a stake higher than balance.
                    if (nextStakeValue > currentBalance && currentBalance > 0) {
                        nextStakeValue = currentBalance;
                    }

                    setStakes(prev => ({ ...prev, [mid]: nextStakeValue }));
                }
            } else if (data.button === 'left') {
                if (currentStatus === "BETTING") {
                    if (!miceRef.current[mid]?.notification) {
                        if (currentBalance <= 0) {
                            setMice(prev => ({
                                ...prev,
                                [mid]: { ...prev[mid], notification: { type: 'info', message: 'INSUFFICIENT BALANCE' } }
                            }));
                            setTimeout(() => {
                                setMice(prev => (prev[mid]?.notification?.message === 'INSUFFICIENT BALANCE'
                                    ? { ...prev, [mid]: { ...prev[mid], notification: null } } : prev));
                            }, 3000);
                        } else {
                            placeBet(mid, stakesRef.current[mid] || 10);
                        }
                    }
                } else if (currentStatus === "IN_FLIGHT") {
                    if (miceRef.current[mid]?.notification?.type === 'Awaiting Cashout') cashout(mid);
                }
            }
        };

        remoteSocket.on("bettingPhase", data => {
            if (statusRef.current !== "BETTING") {
                setMice(prev => {
                    const next = { ...prev };
                    Object.keys(next).forEach(id => { next[id].notification = null; });
                    return next;
                });
            }
            setStatus("BETTING");
            setTimer(data.timer);
            setLiveBets(data.liveBets);
            setCurrentMultiplier(1.0);
            multiplierRef.current = 1.0;
            activeRoundIdRef.current = data.roundId;
            fetchMiceInfo();
            if (isLoaded) { sendMessage("rocket", "React_RestartFresh"); sendMessage("rocket", "React_StartBetting"); }
        });

        remoteSocket.on("flightStarted", data => {
            setStatus("IN_FLIGHT");
            setLiveBets(data.liveBets || []);
            activeRoundIdRef.current = data.roundId;
            setMice(prev => {
                const next = { ...prev };
                Object.keys(next).forEach(id => {
                    if (next[id]?.notification?.type === 'Bet Placed') {
                        next[id].notification = { type: 'Awaiting Cashout', message: 'READY?' };
                    }
                });
                return next;
            });
            if (isLoaded) sendMessage("rocket", "React_LaunchRocket", 9999);
        });

        remoteSocket.on("multiplier", data => {
            setCurrentMultiplier(data.multiplier);
            multiplierRef.current = data.multiplier;
            if (isLoaded) sendMessage("rocket", "React_UpdateMultiplier", data.multiplier.toFixed(2) + "x");
        });

        remoteSocket.on("playerCashedOut", data => {
            setLiveBets(p => p.map(b => b.mouseId === data.mouseId ? { ...b, multiplier: data.multiplier, winAmount: data.winAmount } : b));
            if (isLoaded) sendMessage("rocket", "React_UserCashOut", data.winAmount);
        });

        remoteSocket.on("player:won", data => {
            const { mouseId, winAmount } = data;
            if (miceIdsRef.current.includes(mouseId)) {
                setMice(prev => ({
                    ...prev,
                    [mouseId]: {
                        ...prev[mouseId],
                        notification: { type: 'Won', message: `+${Number(winAmount).toFixed(2)}` }
                    }
                }));
                fetchMiceInfo(); // Sync balance
            }
        });

        remoteSocket.on("player:lost", data => {
            const { mouseId } = data;
            // We only trigger this for the specific mouse that lost
            if (miceIdsRef.current.includes(mouseId)) {
                setMice(prev => ({
                    ...prev,
                    [mouseId]: {
                        ...prev[mouseId],
                        notification: { type: 'Lost', message: 'BOMBED!' }
                    }
                }));

                fetchMiceInfo(); // Sync balance
            }
        });

        remoteSocket.on("crashed", data => {
            setStatus("CRASHED");
            setInitialCrashHistory(data.history);
            activeRoundIdRef.current = "";

            console.log("Crashed Point ref: ",multiplierRef);

            setStakes(prevStakes => {
                const nextStakes: Record<string, number> = {};

                miceIdsRef.current.forEach(id => {
                    const currentBalance = miceDataRef.current[id]?.balance || 0;
                    const previousStake = prevStakes[id] || 10;

                    if (currentBalance <= 0) {
                        // No money left
                        nextStakes[id] = 0;
                    } else if (currentBalance < previousStake) {
                        // Balance is now lower than the last stake (forced reduction)
                        // This covers your "below 10" rule automatically
                        nextStakes[id] = currentBalance;
                    } else {
                        // Balance is healthy, maintain the previous stake
                        nextStakes[id] = previousStake;
                    }
                });
                return nextStakes;
            });



            if (isLoaded) sendMessage("rocket", "React_TriggerFlyAway");
            fetchMiceInfo();
        });

        remoteSocket.on("jackpot:won",data=>{
            const { winner, type, stationId, deviceId, amount } = data;
            if (miceIdsRef.current.includes(winner)) {
                setMice(prev => ({
                    ...prev,
                    [winner]: {
                        ...prev[winner],
                        notification: { type: 'Won', message: `Jackpot: +${Number(amount).toFixed(2)}` }
                    }
                }));
                fetchMiceInfo();
            }
            //if (isLoaded) sendMessage("rocket", "React_JackpotAwarded",type,amount);
        });

        remoteSocket.on("bonusAwarded", data => {
            // Destructure the new data structure
            const { mouseId, bonusAmount, bonusPercentage } = data;

            // 1. Update the balance in miceData immediately
            setMiceData(prev => {
                if (!prev[mouseId]) return prev;
                return {
                    ...prev,
                    [mouseId]: {
                        ...prev[mouseId],
                        balance: prev[mouseId].balance + bonusAmount
                    }
                };
            });

            // 2. Set the Stake: If the mouse was below 10, update the stake to match the new balance
            setStakes(prev => {
                const currentStake = prev[mouseId] || 0;
                const potentialNewBalance = (miceDataRef.current[mouseId]?.balance || 0) + bonusAmount;

                if (currentStake < 10) {
                    // If they are now above 10, default them to 10. Otherwise, give them their full balance as stake.
                    const nextStake = potentialNewBalance >= 10 ? 10 : potentialNewBalance;
                    return { ...prev, [mouseId]: nextStake };
                }
                return prev;
            });

            // 3. Show a detailed Bonus notification
            // If bonusPercentage exists (e.g. 10), show it; otherwise just show amount
            const bonusMsg = bonusPercentage
                ? `${bonusPercentage}% BONUS (+${bonusAmount})`
                : `BONUS +${bonusAmount}`;

            setMice(prev => ({
                ...prev,
                [mouseId]: {
                    ...prev[mouseId],
                    notification: { type: 'Won', message: bonusMsg }
                }
            }));

            // 4. Clear the notification after 4 seconds
            setTimeout(() => {
                setMice(prev => {
                    // Use optional chaining and check if the message still contains 'BONUS'
                    if (prev[mouseId]?.notification?.message.includes('BONUS')) {
                        return { ...prev, [mouseId]: { ...prev[mouseId], notification: null } };
                    }
                    return prev;
                });
            }, 4000);

            // 5. Sync with server for absolute accuracy
            fetchMiceInfo();
        });

        remoteSocket.on('deviceConfig', data => {
            if (data.maxStake) setMaxStake(data.maxStake);
            if (data.bonusPercentage) setBonusPercentage(data.bonusPercentage);
        });

        remoteSocket.on("jackpot:stats", data => setJackpots(data));
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
            remoteSocket.off("jackpot:stats");
        };
    }, [fetchMiceInfo, plugMouse, stationId, isLoaded, sendMessage]);

    return (
        <div
            className="h-screen w-screen bg-[#061e3d] text-white flex flex-col overflow-hidden uppercase font-sans relative"
        >
            <style dangerouslySetInnerHTML={{ __html: `
                @keyframes pulse-fast { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
                .animate-pulse-fast { animation: pulse-fast 0.6s infinite; }
                .hide-scrollbar::-webkit-scrollbar { display: none; }
                
                @keyframes coin-enter {
                    0% { transform: translate(-50%, 140px) scale(0.3); opacity: 0; }
                    40% { opacity: 1; transform: translate(-50%, -10px) scale(1.4); }
                    100% { transform: translate(-50%, -40px) scale(1); opacity: 0; }
                }
                .coin-anim { position: absolute; left: 50%; bottom: 0; animation: coin-enter 1s cubic-bezier(.17,.67,.83,.67) forwards; pointer-events: none; z-index: 100; }
                
                .glass-slot { 
                    background: rgba(10, 42, 77, 0.4); 
                    backdrop-filter: blur(12px); 
                    border: 1px solid rgba(255, 255, 255, 0.1); 
                }
            `}} />

            <div className="flex flex-1 overflow-hidden min-h-0 relative z-10">
                {/* SIDEBAR */}
                <div className="w-80 bg-[#071626]/90 backdrop-blur-md flex flex-col shrink-0 border-r border-white/10 z-20 shadow-2xl">
                    <div className="p-3 bg-[#163a63] border-b border-white/10 shrink-0">
                        <h2 className="text-sm font-black italic text-blue-300">LIVE BETS</h2>
                    </div>
                    <div className="flex-1 overflow-y-auto hide-scrollbar divide-y divide-white/5">
                        {liveBets.map((bet, idx) => {
                            // Logic to determine background color
                            const isWon = !!bet.multiplier;
                            const isLost = status === 'CRASHED' && !bet.multiplier;

                            let rowBg = "";
                            if (isWon) rowBg = "bg-emerald-500/20";
                            else if (isLost) rowBg = "bg-red-500/20"; // Reddish background for failed bets

                            return (
                                <div
                                    key={idx}
                                    className={`grid grid-cols-4 items-center px-3 py-4 transition-colors duration-500 ${rowBg}`}
                                >
                                    <span className="text-[13px] font-bold truncate">#{bet.mouseId.slice(-3)}</span>
                                    <span className="text-[13px] font-black text-right">{Number(bet.amount).toFixed(0)}</span>
                                    <span className="text-[13px] font-black text-right text-[#fbc02d]">
                        {bet.multiplier ? `${bet.multiplier}x` : "-"}
                    </span>
                                    <span className={`text-[13px] font-black text-right ${isWon ? 'text-emerald-400' : 'text-red-400/50'}`}>
                        {bet.winAmount || (isLost ? "LOST" : "-")}
                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* GAME CANVAS */}
                <div className="flex-1 flex flex-col min-w-0">
                    <div className="h-20 bg-[#0a2a4d]/60 backdrop-blur-sm flex flex-col shrink-0 border-b border-white/10">
                        <div ref={historyScrollRef} className="flex-1 flex items-center px-2 gap-1 overflow-x-auto hide-scrollbar">
                            {/* Add .slice().reverse() here */}
                            {initialCrashHistory.slice().reverse().map((game) => (
                                <div
                                    key={game._id}
                                    className={`px-4 py-1.5 rounded text-sm font-black italic shrink-0 ${game.crashPoint < 2 ? 'bg-[#9c27b0]' : 'bg-[#00bcd4]'}`}
                                >
                                    {game.crashPoint.toFixed(2)}x
                                </div>
                            ))}
                        </div>
                        <div className="h-10 bg-[#163a63]/80 flex items-center justify-between px-10 text-[16px] font-black">
                            <span className="text-[#00bcd4]">BRONZE: {jackpots?.device?.poolAmount || 0}</span>
                            <span className="text-[#e53935]">SILVER: {jackpots?.silver?.poolAmount || 0}</span>
                            <span className="text-[#fbc02d]">GOLD: {jackpots?.gold?.poolAmount || 0}</span>
                        </div>
                    </div>
                    <div className="flex-1 relative bg-transparent flex items-center justify-center">
                        <div className="absolute inset-0 z-0"><Unity unityProvider={unityProvider} style={{ width: "100%", height: "100%" }} /></div>
                        {status === "BETTING" && <div className="absolute inset-0 z-50"><BettingTimer timer={timer} status={status} /></div>}
                    </div>
                </div>
            </div>

            {/* MICE SLOTS FOOTER */}
            <div className="h-1/6 bg-transparent flex items-center border-t border-white/20 shrink-0 z-30">
                {Array.from({ length: MAX_SLOTS }).map((_, index) => {
                    const mId = miceIds[index];
                    const mData = mId ? miceData[mId] : null;
                    const mouseState = mId ? mice[mId] : undefined;
                    const notification = mouseState?.notification;
                    const isPluggedIn = !!mId;

                    // ... inside the .map loop for MAX_SLOTS
                    let stateColor = isPluggedIn ? slotColors[index] : "#1a1a1a";

                    if (notification?.type === 'Won') stateColor = "#22c55e";
                    else if (notification?.type === 'Lost') stateColor = "#ef4444";
                    else if (notification?.type === 'info') stateColor = "#475569"; // Slate gray for info
                    else if (notification?.type === 'Bet Placed') stateColor = "#fbc02d";
                    else if (notification?.type === 'Awaiting Cashout') stateColor = "#3b82f6";
                    else if (notification?.type === 'Cashing Out') stateColor = "#1e40af";

                    return (
                        <div key={index} className={`flex-1 h-full flex flex-col border border-white/10 relative overflow-visible glass-slot transition-all duration-500 ${!isPluggedIn ? 'opacity-30 grayscale' : 'opacity-100'}`} style={{ backgroundImage: "url('/stars_01.png')" }}>

                            {/* Coin Fly-In Animation */}
                            {notification?.type === 'Won' && <div className="coin-anim text-5xl drop-shadow-[0_0_15px_rgba(251,192,45,0.9)]">💰</div>}

                            {/* UPPER SECTION (NOW 50% HEIGHT) */}
                            <div
                                className={`h-1/2 flex items-stretch relative overflow-hidden transition-all duration-75 ${
                                    mouseState?.isPressed ? 'opacity-50 scale-95' : 'opacity-100 scale-100'
                                }`}
                            >
                                <div className="w-1/5 flex items-center justify-center text-4xl font-black text-white" style={{ backgroundColor: isPluggedIn ? stateColor : "#1a1a1a" }}>{index + 1}</div>

                                <div className="flex-1 flex items-center justify-center px-2 relative">
                                    {notification ? (
                                        <div className={`absolute inset-0 z-40 flex flex-col items-center justify-center font-black text-white text-center ${notification.type === 'Cashing Out' ? 'animate-pulse-fast' : ''}`} style={{ backgroundColor: stateColor }}>
                                            <span className="text-[12px] uppercase opacity-90 tracking-tighter">{notification.type}</span>
                                            <span className="text-[20px] drop-shadow-md">{notification.message}</span>
                                            {(notification.type === 'Awaiting Cashout' || notification.type === 'Cashing Out') && (
                                                <span className="text-[16px] text-yellow-300 font-bold drop-shadow-sm">KES {((stakes[mId!] || 10) * currentMultiplier).toFixed(0)}</span>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-4">
                                            <div className="text-center leading-tight">
                                                <div className="text-[10px] font-black uppercase text-blue-200">{isPluggedIn ? (status === "BETTING" ? "READY" : "PLAY") : "OFF"}</div>
                                                <div className="text-[16px] font-black">{isPluggedIn ? "JUMP" : "---"}</div>
                                            </div>
                                            <img src="/mouse.png" className={`w-12 h-12 object-contain ${isPluggedIn ? "" : "opacity-10 grayscale"}`} alt="mouse" />
                                            <div className="text-center leading-tight">
                                                <div className="text-[10px] font-black uppercase text-blue-200">Level</div>
                                                <div className="text-[16px] font-black">{isPluggedIn ? "UP" : "--"}</div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* FOOTER SECTION (NOW 50% HEIGHT) */}
                            <div className={`h-1/2 bg-black/70 backdrop-blur-md flex items-center px-2 py-2 gap-2 transition-opacity ${!isPluggedIn ? 'opacity-0' : 'opacity-100'}`}>
                                <div className="flex-1 flex flex-col border-r border-white/10 pr-2">
                                    <span className="text-[11px] font-black text-slate-400">BALANCE</span>
                                    <div className="bg-[#121212]/80 rounded px-2 py-1 text-[18px] font-black text-emerald-400 tabular-nums">KES {mData?.balance?.toFixed(0) || "0"}</div>
                                </div>
                                <div className="flex-1 flex flex-col pl-2">
                                    <span className="text-[11px] font-black text-slate-400 uppercase">Stake</span>
                                    <div className="bg-[#121212]/80 rounded px-2 py-1 text-[18px] font-black text-[#fbc02d] tabular-nums">KES {(stakes[mId || ""] || 10).toFixed(0)}</div>
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