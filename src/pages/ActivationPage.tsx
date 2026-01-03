import React, { useEffect, useState } from 'react';
import { socket } from '../services/socket';

interface MouseState {
    id: string;
    isPressed: boolean;
}

const ActivationPage: React.FC = () => {
    const [pcid,setPcId] = useState("null");
    const [mice, setMice] = useState<Record<string, MouseState>>({});
    const [connected, setConnected] = useState(socket.connected);
    const [activationCode,setActivationCode] = useState("00000");

    useEffect(() => {
        if (connected) {
            getActivationCode();
        }
        const onConnect = () => setConnected(true);
        const onDisconnect = () => { setConnected(false); setMice({}); };

        const onStatus = (data: { event: string; id: string }) => {
            if (data.event === 'connected') {
                setMice(prev => ({ ...prev, [data.id]: { id: data.id, isPressed: false } }));
            } else {
                setMice(prev => {
                    const next = { ...prev };
                    delete next[data.id];
                    return next;
                });
            }
        };

        const onClick = (data: { id: string }) => {
            setMice(prev => ({ ...prev, [data.id]: { ...prev[data.id], isPressed: true } }));
            setTimeout(() => {
                setMice(prev => {
                    if (!prev[data.id]) return prev;
                    return { ...prev, [data.id]: { ...prev[data.id], isPressed: false } };
                });
            }, 300);
        };

        const getPcStats=(data:{pcId: string})=>{
            setPcId(data.pcId);
        }

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('status', onStatus);
        socket.on('click', onClick);
        socket.on("pc_stats",getPcStats);

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('status', onStatus);
            socket.off('click', onClick);
            socket.off("pc_stats",getPcStats);
        };
    }, [connected]);

    const getActivationCode=async()=>{
        const response = await fetch("http://localhost:5000/getActivationCode");

        const activation_code = await response.json();
        setActivationCode(activation_code);
    }

    return (
        <div className="min-h-screen bg-[#1e293b] text-slate-200 font-sans flex flex-col">
            <div className="p-6 flex justify-between items-center bg-[#0f172a]/40 border-b border-white/5">
                <div className="flex items-center gap-4">
                    <h1 className="text-xl font-bold text-white tracking-tight uppercase">Terminal Activation</h1>
                    <div className={`px-3 py-1 rounded-md border text-[10px] font-black flex items-center gap-2 ${
                        connected ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                    }`}>
                        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        {connected ? 'ONLINE' : 'OFFLINE'}
                    </div>
                </div>

                <div className="bg-rose-500 border border-rose-400 py-2 px-6 rounded-md shadow-lg shadow-rose-900/20">
                    <p className="text-white text-xs font-black tracking-wider animate-pulse uppercase">
                        ⚠️ PLUG IN ALL DEVICES BEFORE ACTIVATING!
                    </p>
                </div>
            </div>

            <div className="flex-grow flex items-center justify-center py-12">
                <div className="bg-[#0f172a] border border-white/10 p-12 rounded-3xl shadow-2xl text-center max-w-lg w-full">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-[0.3em]">Activation PIN</span>
                    <div className="text-7xl font-mono font-black text-white mt-4 tracking-widest">
                        {activationCode}
                    </div>
                    <div className="mt-10 pt-8 border-t border-white/5 gap-3">
                        <p className="text-emerald-400 text-sm font-black uppercase tracking-widest drop-shadow-[0_0_8px_rgba(52,211,153,0.3)]">
                            Please use PIN above to activate this device!
                        </p>
                        <p className="text-lg font-bold animate-pulse">{pcid}</p>
                    </div>
                </div>
            </div>

            <div className="bg-[#0f172a]/60 backdrop-blur-md border-t border-white/10 p-10">
                <div className="max-w-7xl mx-auto">
                    <div className="flex items-center gap-4 mb-8">
                        <span className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Hardware Diagnostics</span>
                        <div className="h-px flex-grow bg-slate-700" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {Object.values(mice).map((mouse) => (
                            <div
                                key={mouse.id}
                                className={`p-5 rounded-xl border-2 transition-all duration-150 flex items-center gap-5 ${
                                    mouse.isPressed
                                        ? 'bg-emerald-600 border-emerald-400 shadow-xl scale-[1.02]'
                                        : 'bg-[#1e293b] border-white/5'
                                }`}
                            >
                                <div className={`shrink-0 w-14 h-14 rounded-xl flex items-center justify-center shadow-inner ${
                                    mouse.isPressed ? 'bg-white text-emerald-600' : 'bg-[#0f172a] text-slate-600'
                                }`}>
                                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2" />
                                    </svg>
                                </div>
                                <div className="min-w-0 flex-grow">
                                    <p className={`text-[10px] font-black uppercase tracking-widest ${mouse.isPressed ? 'text-emerald-100' : 'text-slate-500'}`}>
                                        Device ID
                                    </p>
                                    <p className={`text-xs font-mono font-bold break-all mt-1 ${mouse.isPressed ? 'text-white' : 'text-slate-300'}`}>
                                        {mouse.id}
                                    </p>
                                </div>
                                <div className={`px-3 py-1 rounded text-[10px] font-black uppercase border ${
                                    mouse.isPressed
                                        ? 'bg-white text-emerald-700 border-white'
                                        : 'bg-slate-800 text-slate-500 border-slate-700'
                                }`}>
                                    {mouse.isPressed ? 'SIGNAL' : 'IDLE'}
                                </div>
                            </div>
                        ))}

                        {Object.keys(mice).length === 0 && (
                            <div className="col-span-full py-12 text-center border-2 border-dashed border-white/5 rounded-2xl">
                                <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">
                                    Scanning for controller hardware...
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ActivationPage;