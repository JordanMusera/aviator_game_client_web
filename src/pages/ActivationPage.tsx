import React, { useEffect, useState } from 'react';
import { localSocket, remoteSocket } from "../services/socket";
import { api_url, remote_url } from "../constants/api";
import { pc_id } from "../services/socket";
import { useNavigate } from "react-router-dom";

interface MouseState {
    id: string;
    isPressed: boolean;
}

const ActivationPage: React.FC = () => {
    const [mice, setMice] = useState<Record<string, MouseState>>({});
    const [miceIds, setMiceIds] = useState<string[]>([]);
    const [connected, setConnected] = useState(localSocket.connected);
    const [activationCode, setActivationCode] = useState("00000");

    const navigate = useNavigate();
    const slotColors = ["#8b7b1e", "#0a6b31", "#4a235a", "#922b21", "#566573", "#9b1b30"];

    const getActivationCode = async () => {
        try {
            const response = await fetch(`${api_url}/getActivationCode`);
            const data = await response.json();
            setActivationCode(data.code);
        } catch (error) {
            console.error("Failed to fetch code", error);
        }
    };

    useEffect(() => {
        // 1. If already connected on mount, fetch code and request mice immediately
        if (localSocket.connected) {
            setConnected(true);
            getActivationCode();
            localSocket.emit("requestStatus", "sync");
        }

        const onConnect = () => {
            setConnected(true);
            getActivationCode();
            localSocket.emit("requestStatus", "sync");
        };

        const onDisconnect = () => {
            setConnected(false);
            setMice({});
            setMiceIds([]);
        };

        const onStatus = (data: { event: string; id: string }) => {
            if (data.event === 'connected') {
                setMice(prev => ({ ...prev, [data.id]: { id: data.id, isPressed: false } }));
                setMiceIds(prev => prev.includes(data.id) ? prev : [...prev, data.id]);
            } else {
                setMice(prev => {
                    const next = { ...prev };
                    delete next[data.id];
                    return next;
                });
                setMiceIds(prev => prev.filter(mid => mid !== data.id));
            }
        };

        const onClick = (data: { id: string }) => {
            setMice(prev => {
                if (!prev[data.id]) return prev;
                return { ...prev, [data.id]: { ...prev[data.id], isPressed: true } };
            });
            setTimeout(() => {
                setMice(prev => {
                    if (!prev[data.id]) return prev;
                    return { ...prev, [data.id]: { ...prev[data.id], isPressed: false } };
                });
            }, 100);
        };

        const handleActivation = async (data: any) => {
            localStorage.setItem('stationName', data.stationName);
            localStorage.setItem('stationId', data.stationId);

            try {
                const request = await fetch(`${remote_url}/api/v1/device/login-device`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ deviceId: pc_id })
                });

                const data1 = await request.json();
                if (request.ok && data1.success) {
                    localStorage.setItem('token', data1.token);
                }

                await fetch(`${remote_url}/api/v1/device/add-mouse`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + data1.token
                    },
                    credentials: 'include',
                    body: JSON.stringify({ mice: miceIds })
                });

                navigate('/game/play');
            } catch (error) {
                console.error("Login failed", error);
            }
        };

        localSocket.on('connect', onConnect);
        localSocket.on('disconnect', onDisconnect);
        localSocket.on('status', onStatus);
        localSocket.on('click', onClick);
        remoteSocket.on('deviceActivated', handleActivation);

        // 2. Fallback: Ask for status again after 1 second if still no mice are found
        const syncTimer = setTimeout(() => {
            if (localSocket.connected && miceIds.length === 0) {
                localSocket.emit("requestStatus", "sync");
            }
        }, 1000);

        return () => {
            localSocket.off('connect', onConnect);
            localSocket.off('disconnect', onDisconnect);
            localSocket.off('status', onStatus);
            localSocket.off('click', onClick);
            remoteSocket.off('deviceActivated', handleActivation);
            clearTimeout(syncTimer);
        };
    }, [navigate, miceIds.length]);

    return (
        <div className="h-screen bg-[#0b0b0e] text-slate-200 font-sans flex flex-col overflow-hidden">
            <style dangerouslySetInnerHTML={{ __html: `
                .hide-scrollbar::-webkit-scrollbar { display: none; }
                .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}} />

            <div className="h-14 border-b border-white/5 bg-[#121117] flex items-center justify-between px-6 shrink-0 z-10">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-red-600 rounded flex items-center justify-center shadow-[0_0_15px_rgba(225,29,72,0.4)]">
                        <span className="text-white font-black italic tracking-tighter">A</span>
                    </div>
                    <h1 className="text-lg font-black uppercase tracking-tighter text-white">
                        Aviator <span className="text-red-600">Pro</span> Console
                    </h1>
                </div>

                <div className="bg-red-600/10 border border-red-600/20 py-1 px-4 rounded-full">
                    <p className="text-red-500 text-[10px] font-black tracking-widest animate-pulse uppercase">
                        ⚠️ PLUG IN ALL DEVICES BEFORE ACTIVATING!
                    </p>
                </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center relative p-6 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#1a1921] to-[#0b0b0e]">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 pointer-events-none" />

                <div className="z-10 bg-[#121117]/80 backdrop-blur-xl border border-white/10 p-10 rounded-[2.5rem] shadow-2xl text-center max-w-lg w-full relative">
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-red-600 text-[9px] font-black px-4 py-1 rounded-full tracking-[0.2em] uppercase shadow-[0_0_15px_rgba(225,29,72,0.5)]">
                        System Setup
                    </div>

                    <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.4em] block mb-4">Activation Code</span>

                    <div className="bg-black/40 rounded-2xl py-8 border border-white/5 shadow-inner">
                        <div className="text-7xl font-mono font-black text-white tracking-[0.2em] drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                            {activationCode}
                        </div>
                    </div>

                    <div className="mt-8 pt-8 border-t border-white/5 space-y-4">
                        <p className="text-emerald-500 text-xs font-black uppercase tracking-widest leading-relaxed">
                            Awaiting remote activation command...<br/>
                            <span className="text-slate-500 opacity-60">Enter the PIN on your management dashboard</span>
                        </p>

                        <div className="inline-block px-4 py-2 bg-white/5 rounded-lg border border-white/10">
                            <span className="text-[10px] text-slate-500 font-bold uppercase mr-2">PC ID:</span>
                            <span className="text-xs font-mono font-bold text-white">{pc_id}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="h-52 w-full shrink-0 bg-[#08080a] border-t border-white/10 px-6 py-4 flex flex-col overflow-hidden">
                <div className="flex items-center gap-4 mb-3 shrink-0">
                    <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse shadow-[0_0_10px_#10b981]' : 'bg-red-600'}`} />
                        <span className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Diagnostic Mode: {connected ? 'Online' : 'Offline'}</span>
                    </div>
                    <div className="px-3 py-1 rounded bg-white/5 border border-white/10 text-xs font-black text-white tabular-nums">
                        {miceIds.length} MICE DETECTED
                    </div>
                    <div className="h-px flex-grow bg-gradient-to-r from-white/10 to-transparent" />
                </div>

                <div className="flex-1 flex flex-nowrap gap-4 overflow-x-auto overflow-y-hidden pb-2 hide-scrollbar">
                    {miceIds.map((id, index) => {
                        const mouse = mice[id];
                        const color = slotColors[index % slotColors.length];

                        return (
                            <div key={id} className={`w-[240px] shrink-0 flex flex-col rounded-xl border-2 overflow-hidden transition-all duration-75 select-none shadow-xl h-full ${mouse?.isPressed ? 'border-white scale-[0.96] brightness-125' : 'border-white/10 bg-[#0d1111]'}`}>
                                <div className="flex h-1/2 border-b border-white/5">
                                    <div style={{ backgroundColor: color }} className="w-16 flex items-center justify-center text-4xl font-black italic text-black/90">
                                        {index + 1}
                                    </div>
                                    <div className="flex-1 flex items-center justify-center bg-black/40">
                                        <div className="flex flex-col items-center">
                                            <span className={`text-[10px] font-black uppercase tracking-tighter ${mouse?.isPressed ? 'text-emerald-400' : 'text-slate-500'}`}>
                                                {mouse?.isPressed ? 'RECEIVING' : 'STANDBY'}
                                            </span>
                                            <div className={`w-8 h-1 rounded-full mt-1 ${mouse?.isPressed ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-slate-800'}`} />
                                        </div>
                                    </div>
                                </div>
                                <div className="flex-1 flex flex-col justify-center p-3 bg-gradient-to-tr from-black/80 to-[#121616]">
                                    <label className="text-[8px] font-black text-slate-500 uppercase mb-1 tracking-widest">Device Hardware ID</label>
                                    <div className="h-8 bg-[#050707] rounded border border-white/5 flex items-center px-3">
                                        <span className="text-[10px] font-mono font-bold text-slate-300 truncate">
                                            {id}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {miceIds.length === 0 && (
                        <div className="flex-1 flex items-center justify-center border-2 border-dashed border-white/5 rounded-2xl">
                            <span className="text-xs font-black text-slate-600 uppercase tracking-[0.3em] animate-pulse">
                                Connect mouse hardware to begin diagnostics
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ActivationPage;