import { useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, Sun, Heart, Sparkles, Clock } from "lucide-react";
import { mockData } from "../data/mockData";

export function WarmHuman() {
  const [focus, setFocus] = useState("");

  // Get greeting based on time
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  // Determine status message based on capacity
  const getStatusMessage = (score: number) => {
    if (score >= 80) return { text: "You're feeling great!", emoji: "✨", color: "emerald" };
    if (score >= 60) return { text: "You're in good shape", emoji: "🌟", color: "blue" };
    if (score >= 40) return { text: "Take it steady", emoji: "🌤️", color: "amber" };
    return { text: "Be gentle with yourself", emoji: "🌙", color: "purple" };
  };

  const status = getStatusMessage(mockData.capacityScore);

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 via-orange-50/30 to-rose-50/20">
      {/* Header */}
      <div className="px-6 pt-8 pb-6">
        <Link to="/" className="inline-flex items-center gap-2 text-amber-600 hover:text-amber-700 transition-colors mb-6">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back</span>
        </Link>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Sun className="w-5 h-5 text-amber-500" />
            <h1 className="text-xl font-medium text-amber-900">{greeting}</h1>
          </div>
          <p className="text-sm text-amber-700/70">{mockData.date}</p>
        </div>
      </div>

      <div className="px-6 space-y-6 max-w-md mx-auto pb-20">
        {/* Capacity Score - Friendly Card */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-amber-100">
          <div className="space-y-5">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-sm text-amber-900/60">Your energy today</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-semibold text-amber-900">
                    {mockData.capacityScore}
                  </span>
                  <span className="text-lg text-amber-900/40">/ 100</span>
                </div>
              </div>
              <div className="text-3xl">{status.emoji}</div>
            </div>

            {/* Visual Progress */}
            <div className="space-y-2">
              <div className="h-3 bg-amber-50 rounded-full overflow-hidden">
                <div 
                  className={`h-full bg-gradient-to-r from-amber-400 to-orange-400 rounded-full transition-all duration-1000`}
                  style={{ width: `${mockData.capacityScore}%` }}
                />
              </div>
              <p className="text-sm text-amber-900/70 font-medium">
                {status.text}
              </p>
            </div>

            {/* Recovery & Stress */}
            <div className="flex gap-3 pt-2">
              <div className="flex-1 bg-emerald-50 rounded-2xl p-3 border border-emerald-100">
                <div className="flex items-center gap-2 mb-1">
                  <Heart className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-xs text-emerald-900/60">Recovery</span>
                </div>
                <p className="text-2xl font-semibold text-emerald-900">{mockData.recoveryScore}</p>
              </div>
              <div className="flex-1 bg-blue-50 rounded-2xl p-3 border border-blue-100">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  <span className="text-xs text-blue-900/60">Stress</span>
                </div>
                <p className="text-2xl font-semibold text-blue-900">{mockData.stressLevel}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Recommendation - Friendly Card */}
        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-3xl p-6 shadow-sm border border-purple-100">
          <div className="flex gap-4">
            <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
              <span className="text-xl">💡</span>
            </div>
            <div className="flex-1 space-y-2">
              <p className="text-sm font-medium text-purple-900">We recommend</p>
              <p className="text-amber-900 leading-relaxed">
                {mockData.recommendation}
              </p>
            </div>
          </div>
        </div>

        {/* Today's Focus Input */}
        <div className="space-y-3">
          <label className="text-sm font-medium text-amber-900 flex items-center gap-2">
            <span>✍️</span>
            <span>What's your focus today?</span>
          </label>
          <textarea
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder="I want to focus on..."
            rows={2}
            className="w-full px-5 py-4 bg-white border-2 border-amber-100 rounded-2xl focus:border-amber-300 focus:outline-none text-amber-900 placeholder:text-amber-900/30 transition-colors resize-none"
          />
        </div>

        {/* Calendar - Warm & Friendly */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-900">
              Your day ahead
            </span>
          </div>
          <div className="space-y-2.5">
            {mockData.calendarEvents.map((event) => (
              <div 
                key={event.id} 
                className="bg-white rounded-2xl p-4 shadow-sm border border-amber-50 hover:border-amber-100 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="w-14 pt-0.5">
                    <p className="text-sm font-medium text-amber-900">{event.time.split(' ')[0]}</p>
                    <p className="text-xs text-amber-600">{event.time.split(' ')[1]}</p>
                  </div>
                  <div className="flex-1 pt-0.5">
                    <p className="text-amber-900 font-medium mb-0.5">{event.title}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-amber-900/50">{event.duration}</span>
                      {event.type === 'focus' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-700 text-xs rounded-full border border-purple-100">
                          <Sparkles className="w-3 h-3" />
                          Focus time
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Encouraging Footer Message */}
        <div className="text-center py-6">
          <p className="text-sm text-amber-900/50">
            You've got this 💪
          </p>
        </div>
      </div>
    </div>
  );
}
