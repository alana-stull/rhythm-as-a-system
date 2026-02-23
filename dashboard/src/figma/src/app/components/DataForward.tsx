import { useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, Activity, TrendingUp, TrendingDown, Zap, Calendar } from "lucide-react";
import { mockData } from "../data/mockData";

export function DataForward() {
  const [focus, setFocus] = useState("");

  // Calculate the angle for the arc
  const scorePercentage = mockData.capacityScore / 100;
  const angle = scorePercentage * 180; // Half circle

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <div className="px-5 pt-8 pb-5 border-b border-slate-800">
        <Link to="/" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-300 transition-colors mb-5">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-xs">Back</span>
        </Link>
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-xl font-medium text-slate-100">Rhythm</h1>
            <p className="text-xs text-slate-500 mt-0.5">{mockData.date}</p>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-emerald-400">Oura Synced</span>
          </div>
        </div>
      </div>

      <div className="px-5 py-6 space-y-6 max-w-md mx-auto pb-20">
        {/* Capacity Score with Arc Visualization */}
        <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Capacity Score
                </span>
              </div>
              <span className="text-xs text-slate-500">Live</span>
            </div>

            {/* Arc Meter */}
            <div className="relative flex items-center justify-center py-6">
              <svg width="200" height="120" viewBox="0 0 200 120" className="overflow-visible">
                {/* Background arc */}
                <path
                  d="M 20 100 A 80 80 0 0 1 180 100"
                  fill="none"
                  stroke="rgb(30, 41, 59)"
                  strokeWidth="12"
                  strokeLinecap="round"
                />
                {/* Gradient arc */}
                <defs>
                  <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="rgb(59, 130, 246)" />
                    <stop offset="50%" stopColor="rgb(139, 92, 246)" />
                    <stop offset="100%" stopColor="rgb(236, 72, 153)" />
                  </linearGradient>
                </defs>
                <path
                  d="M 20 100 A 80 80 0 0 1 180 100"
                  fill="none"
                  stroke="url(#scoreGradient)"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray="251.2"
                  strokeDashoffset={251.2 - (251.2 * scorePercentage)}
                  className="transition-all duration-1000"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-5xl font-bold text-slate-100">
                  {mockData.capacityScore}
                </span>
                <span className="text-xs text-slate-500 mt-1">out of 100</span>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-800">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-3 h-3 text-emerald-400" />
                  <span className="text-xs text-slate-500">Recovery</span>
                </div>
                <p className="text-2xl font-semibold text-slate-100">{mockData.recoveryScore}</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <TrendingDown className="w-3 h-3 text-amber-400" />
                  <span className="text-xs text-slate-500">Stress</span>
                </div>
                <p className="text-2xl font-semibold text-slate-100">{mockData.stressLevel}</p>
              </div>
            </div>
          </div>
        </div>

        {/* AI Recommendation */}
        <div className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-2xl p-5 border border-blue-500/20">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
              <Zap className="w-4 h-4 text-blue-400" />
            </div>
            <div className="flex-1 space-y-1">
              <p className="text-xs font-medium text-blue-400 uppercase tracking-wider">
                AI Recommendation
              </p>
              <p className="text-sm text-slate-200 leading-relaxed">
                {mockData.recommendation}
              </p>
            </div>
          </div>
        </div>

        {/* Today's Focus Input */}
        <div className="space-y-3">
          <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            Today's Intention
          </label>
          <input
            type="text"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder="Set your primary focus..."
            className="w-full px-4 py-3.5 bg-slate-900 border border-slate-800 rounded-xl focus:border-blue-500 focus:outline-none text-slate-100 placeholder:text-slate-600 transition-colors text-sm"
          />
        </div>

        {/* Calendar with Timeline */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Schedule
            </span>
            <span className="text-xs text-slate-600">
              {mockData.calendarEvents.length} events
            </span>
          </div>
          <div className="space-y-2">
            {mockData.calendarEvents.map((event, index) => (
              <div key={event.id} className="bg-slate-900 rounded-xl p-4 border border-slate-800 hover:border-slate-700 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center gap-1 pt-0.5">
                    <div className={`w-2 h-2 rounded-full ${
                      event.type === 'focus' ? 'bg-purple-500' :
                      event.type === 'meeting' ? 'bg-blue-500' :
                      'bg-slate-600'
                    }`} />
                    {index < mockData.calendarEvents.length - 1 && (
                      <div className="w-0.5 h-8 bg-slate-800" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-medium text-slate-200">{event.title}</p>
                      <span className="text-xs text-slate-500 flex-shrink-0">{event.duration}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{event.time}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
