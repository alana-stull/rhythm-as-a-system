import { useState } from "react";
import { Brain, TrendingUp, Activity, Zap, Calendar, Clock, ChevronRight } from "lucide-react";
import { mockData } from "../data/mockData";

export function RhythmDashboard() {
  const [intention, setIntention] = useState("");
  const [showSchedule, setShowSchedule] = useState(false);
  const [hasSubmittedIntention, setHasSubmittedIntention] = useState(false);

  const currentTime = new Date().toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });

  const handleIntentionSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && intention.trim()) {
      setHasSubmittedIntention(true);
    }
  };

  const getCapacityColor = (score: number) => {
    if (score >= 80) return "text-emerald-600";
    if (score >= 60) return "text-blue-600";
    if (score >= 40) return "text-amber-600";
    return "text-slate-600";
  };

  const getCapacityBg = (score: number) => {
    if (score >= 80) return "from-emerald-500/10 to-emerald-600/5";
    if (score >= 60) return "from-blue-500/10 to-blue-600/5";
    if (score >= 40) return "from-amber-500/10 to-amber-600/5";
    return "from-slate-500/10 to-slate-600/5";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-50 to-slate-100">
      {/* Header */}
      <div className="px-6 pt-8 pb-6 max-w-2xl mx-auto">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-light tracking-tight text-slate-900 mb-1">
              Rhythm
            </h1>
            <p className="text-sm text-slate-500">{mockData.date}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-light text-slate-900">{currentTime}</div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-6 max-w-2xl mx-auto space-y-4 pb-12">
        
        {/* Top Row - Base Metrics */}
        <div className="grid grid-cols-3 gap-4">
          {/* Recovery */}
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-5 border border-white/50 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <p className="text-xs uppercase tracking-wider text-slate-600 font-medium">
                Recovery
              </p>
            </div>
            <p className="text-4xl font-light text-slate-900">
              {mockData.recoveryScore}
            </p>
          </div>

          {/* Exposure */}
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-5 border border-white/50 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-blue-600" />
              <p className="text-xs uppercase tracking-wider text-slate-600 font-medium">
                Exposure
              </p>
            </div>
            <p className="text-4xl font-light text-slate-900">
              {mockData.exposureScore}
            </p>
          </div>

          {/* Friction */}
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-5 border border-white/50 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-amber-600" />
              <p className="text-xs uppercase tracking-wider text-slate-600 font-medium">
                Friction
              </p>
            </div>
            <p className="text-4xl font-light text-slate-900">
              {mockData.frictionScore}
            </p>
          </div>
        </div>

        {/* Intention Input */}
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-5 border border-white/50 shadow-sm">
          <label className="text-xs uppercase tracking-wider text-slate-600 font-medium block mb-3">
            Primary Intention
          </label>
          <input
            type="text"
            value={intention}
            onChange={(e) => setIntention(e.target.value)}
            onKeyDown={handleIntentionSubmit}
            placeholder="What's your main priority right now?"
            className="w-full px-0 py-2 border-0 border-b border-slate-200 focus:border-slate-400 focus:outline-none bg-transparent text-slate-900 text-lg placeholder:text-slate-300 transition-colors"
          />
          {intention && !hasSubmittedIntention && (
            <p className="text-xs text-slate-400 mt-2">Press Enter to continue</p>
          )}
        </div>

        {/* Capacity Score - Shows after intention submitted */}
        {hasSubmittedIntention && (
          <div className={`bg-gradient-to-br ${getCapacityBg(mockData.capacityScore)} backdrop-blur-sm rounded-2xl p-6 border border-white/50 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500`}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-600 font-medium mb-2">
                  Capacity Score
                </p>
                <div className="flex items-baseline gap-2">
                  <span className={`text-5xl font-light tracking-tight ${getCapacityColor(mockData.capacityScore)}`}>
                    {mockData.capacityScore}
                  </span>
                  <span className="text-xl text-slate-400 font-light">/100</span>
                </div>
              </div>
              <Activity className={`w-5 h-5 ${getCapacityColor(mockData.capacityScore)} opacity-60`} />
            </div>
            <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
              <div 
                className={`h-full bg-gradient-to-r ${
                  mockData.capacityScore >= 80 ? 'from-emerald-500 to-emerald-600' :
                  mockData.capacityScore >= 60 ? 'from-blue-500 to-blue-600' :
                  mockData.capacityScore >= 40 ? 'from-amber-500 to-amber-600' :
                  'from-slate-500 to-slate-600'
                } transition-all duration-1000 rounded-full`}
                style={{ width: `${mockData.capacityScore}%` }}
              />
            </div>
          </div>
        )}

        {/* Recommendation - Shows after capacity */}
        {hasSubmittedIntention && (
          <div className="bg-gradient-to-br from-purple-500/10 to-blue-500/10 backdrop-blur-sm rounded-2xl p-5 border border-white/50 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-white/60 flex items-center justify-center flex-shrink-0">
                <Brain className="w-4 h-4 text-purple-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs uppercase tracking-wider text-slate-600 font-medium mb-2">
                  Recommendation
                </p>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {mockData.recommendation}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Schedule Toggle Button / Widget */}
        {!showSchedule ? (
          <button
            onClick={() => setShowSchedule(true)}
            className="w-full bg-white/70 backdrop-blur-sm rounded-2xl p-5 border border-white/50 shadow-sm hover:shadow-md transition-all group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-slate-600" />
                <span className="text-sm font-medium text-slate-700">View Today's Schedule</span>
                <span className="text-xs text-slate-400">
                  {mockData.calendarEvents.length} events
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
            </div>
          </button>
        ) : (
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-5 border border-white/50 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-600" />
                <p className="text-xs uppercase tracking-wider text-slate-600 font-medium">
                  Today's Schedule
                </p>
                <span className="text-xs text-slate-400">
                  {mockData.calendarEvents.length} events
                </span>
              </div>
              <button
                onClick={() => setShowSchedule(false)}
                className="text-xs text-slate-500 hover:text-slate-700 transition-colors"
              >
                Hide
              </button>
            </div>
            <div className="space-y-2">
              {mockData.calendarEvents.map((event) => (
                <div 
                  key={event.id} 
                  className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0 group hover:bg-slate-50/50 -mx-2 px-2 rounded-lg transition-colors"
                >
                  <Clock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span className="text-xs text-slate-500 w-14 flex-shrink-0">
                    {event.time.split(' ')[0]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-900 truncate">{event.title}</p>
                  </div>
                  <span className="text-xs text-slate-400 flex-shrink-0">
                    {event.duration}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
