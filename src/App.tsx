import React, {useEffect, useState} from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ActivationPage from './pages/ActivationPage';
import GamePlayPage from "./pages/GamePlayPage";



const App: React.FC = () => {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<Navigate to="/activation" replace />} />
                <Route path="/activation" element={<ActivationPage />} />
                <Route path="/game/play" element={<GamePlayPage/>} />
                <Route
                    path="*"
                    element={
                        <div className="flex items-center justify-center min-h-screen bg-slate-50">
                            <div className="text-center">
                                <h1 className="text-4xl font-bold text-slate-900">404</h1>
                                <p className="text-slate-50 text-sm">Page not found</p>
                                <a href="/" className="mt-4 inline-block text-blue-600 font-medium">
                                    Return Home
                                </a>
                            </div>
                        </div>
                    }
                />
            </Routes>
        </Router>
    );
};

export default App;