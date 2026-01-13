import React from 'react';

interface BettingTimerProps {
    timer: any;
    status: string;
}

const BettingTimer: React.FC<BettingTimerProps> = ({ timer, status }) => {
    if (status !== "BETTING") return null;

    // Progress calculation (Assuming a 10s betting window)
    const maxTime = 10;
    const progressWidth = Math.min((Number(timer) / maxTime) * 100, 100);

    return (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
            {/* Gamish Progress Container */}
            <div className="relative w-96 h-14 bg-[#0a0a0f] border-2 border-white/10 rounded-lg p-1 shadow-2xl overflow-hidden">

                {/* Background "Empty" Track with Grid Pattern */}
                <div className="absolute inset-0 opacity-20"
                     style={{ backgroundImage: 'linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '10px 100%' }} />

                {/* The Active Bar */}
                <div
                    className="relative h-full bg-indigo-600 rounded-sm transition-all duration-1000 ease-linear shadow-[0_0_20px_rgba(79,70,229,0.8)] overflow-hidden"
                    style={{ width: `${progressWidth}%` }}
                >
                    {/* Glossy Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent" />

                    {/* Animated Energy Stripes */}
                    <div className="absolute inset-0 opacity-30 animate-[shimmer_2s_linear_infinite]"
                         style={{
                             backgroundImage: 'linear-gradient(45deg, #fff 25%, transparent 25%, transparent 50%, #fff 50%, #fff 75%, transparent 75%, transparent)',
                             backgroundSize: '30px 30px'
                         }}
                    />
                </div>

                {/* Corner Accents for that "Gamish" HUD feel */}
                <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-indigo-400" />
                <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-indigo-400" />
            </div>
        </div>
    );
};

export default React.memo(BettingTimer);