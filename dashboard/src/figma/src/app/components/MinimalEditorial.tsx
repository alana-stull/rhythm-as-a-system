import { useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, Calendar, Brain } from "lucide-react";
import { mockData } from "../data/mockData";

export function MinimalEditorial() {
  const [focus, setFocus] = useState("");

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="px-6 pt-8 pb-6 border-b border-slate-100">
        <Link to="/" className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-600 transition-colors mb-6">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back</span>
        </Link>
        <div className="space-y-1">
          <h1 className="text-2xl font-light tracking-tight text-slate-900">Rhythm</h1>
          <p className="text-sm text-slate-500">{mockData.date}</p>
        </div>
      </div>

      <div className="px-6 py-8 space-y-12 max-w-md mx-auto">
        {/* Capacity Score - Hero Element */}
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-slate-400">Capacity</p>
            <div className="flex items-baseline gap-2">
              <span className="text-7xl font-extralight tracking-tight text-slate-900">
                {mockData.capacityScore}
              </span>
              <span className="text-2xl text-slate-300 font-light">/100</span>
            </div>
          </div>
          
          {/* Minimal progress bar */}
          <div className="h-0.5 bg-slate-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-slate-900 transition-all duration-1000"
              style={{ width: `${mockData.capacityScore}%` }}
            />
          </div>
        </div>

        {/* Recommendation */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-slate-400" />
            <p className="text-xs uppercase tracking-wider text-slate-400">Recommendation</p>
          </div>
          <p className="text-lg text-slate-800 leading-relaxed">
            {mockData.recommendation}
          </p>
        </div>

        {/* Today's Focus Input */}
        <div className="space-y-3">
          <label className="text-xs uppercase tracking-wider text-slate-400">
            Today's Focus
          </label>
          <input
            type="text"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder="What matters most today?"
            className="w-full px-0 py-3 border-0 border-b border-slate-200 focus:border-slate-900 focus:outline-none bg-transparent text-slate-900 placeholder:text-slate-300 transition-colors"
          />
        </div>

        {/* Calendar */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <p className="text-xs uppercase tracking-wider text-slate-400">Schedule</p>
          </div>
          <div className="space-y-3">
            {mockData.calendarEvents.map((event) => (
              <div key={event.id} className="flex items-baseline gap-4 py-2 border-b border-slate-50 last:border-0">
                <span className="text-sm text-slate-400 w-20 flex-shrink-0">
                  {event.time}
                </span>
                <div className="flex-1 space-y-0.5">
                  <p className="text-slate-900">{event.title}</p>
                  <p className="text-xs text-slate-400">{event.duration}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
