import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import ActivationPage from './pages/ActivationPage';
import GamePlayPage from "./pages/GamePlayPage";

/**
 * RESTORED 404 DESIGN
 */
const NotFoundPage = () => {
    return (
        <div className="flex items-center justify-center min-h-screen bg-[#0b0b0e] relative overflow-hidden font-sans">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 pointer-events-none" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-red-600/5 rounded-full blur-[120px] pointer-events-none" />

            <div className="relative z-10 text-center px-6">
                <div className="mb-6 inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-red-600/10 border border-red-600/30 shadow-[0_0_30px_rgba(220,38,38,0.2)]">
                    <span className="text-red-500 text-4xl font-black italic">!</span>
                </div>
                <h1 className="text-8xl font-black text-white italic tracking-tighter mb-2 leading-none">404</h1>
                <div className="inline-block px-4 py-1 bg-red-600 text-[10px] font-black uppercase tracking-[0.3em] rounded mb-8">System Exception</div>
                <p className="text-slate-400 text-sm font-medium max-w-xs mx-auto mb-10 leading-relaxed uppercase tracking-widest opacity-80">
                    The requested terminal sector does not exist or has been decommissioned.
                </p>
                <Link to="/" className="inline-flex items-center gap-3 px-8 py-4 bg-white/5 border border-white/10 rounded-xl text-white text-xs font-black uppercase tracking-widest hover:bg-white/10 hover:border-red-600/50 transition-all group">
                    <span className="w-2 h-2 rounded-full bg-red-600 group-hover:animate-ping" />
                    Reboot to Home
                </Link>
            </div>
        </div>
    );
};

/**
 * MAIN APP COMPONENT
 */
const App: React.FC = () => {

    useEffect(() => {
        // PREVENT RIGHT-CLICK CONTEXT MENU GLOBALLY
        const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault();
        };

        window.addEventListener('contextmenu', handleContextMenu);

        // Cleanup listener on unmount
        return () => {
            window.removeEventListener('contextmenu', handleContextMenu);
        };
    }, []);

    return (
        <Router>
            {/* GLOBAL CSS INJECTION */}
            <style dangerouslySetInnerHTML={{ __html: `
                * { 
                    cursor: none !important; 
                    -webkit-tap-highlight-color: transparent;
                    user-select: none;
                }
                html, body { 
                    overflow: hidden; 
                    background-color: #0b0b0e; 
                    margin: 0;
                    padding: 0;
                }
            `}} />

            <div className="h-screen w-screen overflow-hidden bg-[#0b0b0e] select-none cursor-none">
                <Routes>
                    <Route path="/" element={<Navigate to="/activation" replace />} />
                    <Route path="/activation" element={<ActivationPage />} />
                    <Route path="/game/play" element={<GamePlayPage />} />
                    <Route path="*" element={<NotFoundPage />} />
                </Routes>
            </div>
        </Router>
    );
};

export default App;