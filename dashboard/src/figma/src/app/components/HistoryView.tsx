import { useState } from "react";
import { Activity, BarChart3 } from "lucide-react";

interface HistoryEntry {
  date: string;
  intention: string;
  rhythmScore: number;
  recoveryScore: number;
  exposureScore: number;
}

const mockHistory: HistoryEntry[] = [
  {
    date: "Feb 21, 2026",
    intention: "Ship new feature and review design system",
    rhythmScore: 78,
    recoveryScore: 82,
    exposureScore: 65,
  },
  {
    date: "Feb 20, 2026",
    intention: "Finalize Q1 roadmap and team planning",
    rhythmScore: 85,
    recoveryScore: 88,
    exposureScore: 72,
  },
  {
    date: "Feb 19, 2026",
    intention: "Deep work on user research synthesis",
    rhythmScore: 72,
    recoveryScore: 75,
    exposureScore: 68,
  },
  {
    date: "Feb 18, 2026",
    intention: "Client presentations and follow-ups",
    rhythmScore: 68,
    recoveryScore: 70,
    exposureScore: 55,
  },
  {
    date: "Feb 17, 2026",
    intention: "Recovery day - light tasks only",
    rhythmScore: 55,
    recoveryScore: 58,
    exposureScore: 48,
  },
];

export function HistoryView() {
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);

  const getRhythmColor = (score: number) => {
    if (score >= 70) return "text-emerald-600";
    if (score >= 50) return "text-blue-600";
    return "text-amber-600";
  };

  const getRhythmBg = (score: number) => {
    if (score >= 70) return "bg-emerald-50";
    if (score >= 50) return "bg-blue-50";
    return "bg-amber-50";
  };

  const getRhythmLabel = (score: number) => {
    if (score >= 70) return "Steady";
    if (score >= 50) return "Balanced";
    return "Stretched";
  };

  const averageRhythm = Math.round(
    mockHistory.reduce((sum, entry) => sum + entry.rhythmScore, 0) / mockHistory.length
  );

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="mb-8">
        <h2 className="text-2xl font-medium text-slate-900 mb-2">History</h2>
        <p className="text-sm text-slate-500">Track your rhythm over time</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-5 border border-slate-200/50 shadow-sm">
          <p className="text-xs uppercase tracking-wider text-slate-500 font-medium mb-2">
            Average Rhythm
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-light text-slate-900">{averageRhythm}</span>
            <span className="text-sm text-slate-400">/100</span>
          </div>
        </div>

        <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-5 border border-slate-200/50 shadow-sm">
          <p className="text-xs uppercase tracking-wider text-slate-500 font-medium mb-2">
            Current Streak
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-light text-slate-900">7</span>
            <span className="text-sm text-slate-400">days</span>
          </div>
        </div>

        <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-5 border border-slate-200/50 shadow-sm">
          <p className="text-xs uppercase tracking-wider text-slate-500 font-medium mb-2">
            Peak Rhythm
          </p>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-600" />
            <span className="text-3xl font-light text-slate-900">85</span>
          </div>
        </div>
      </div>

      {/* History List */}
      <div className="space-y-3">
        {mockHistory.map((entry, index) => (
          <button
            key={index}
            onClick={() => setSelectedEntry(entry)}
            className="w-full bg-white/60 backdrop-blur-sm rounded-2xl p-5 border border-slate-200/50 shadow-sm hover:shadow-md transition-all text-left group"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-sm font-medium text-slate-900">{entry.date}</span>
                  <div className={`px-2 py-0.5 rounded-full ${getRhythmBg(entry.rhythmScore)}`}>
                    <span className={`text-xs font-medium ${getRhythmColor(entry.rhythmScore)}`}>
                      {entry.rhythmScore}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-slate-600 truncate">{entry.intention}</p>
              </div>
              <Activity className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors flex-shrink-0 mt-1" />
            </div>
          </button>
        ))}
      </div>

      {/* Detail Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="text-xl font-medium text-slate-900 mb-1">{selectedEntry.date}</h3>
                <p className="text-sm text-slate-600">{selectedEntry.intention}</p>
              </div>
              <button
                onClick={() => setSelectedEntry(null)}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors text-slate-600"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              {/* Rhythm Score */}
              <div className="bg-gradient-to-br from-slate-50 to-white rounded-xl p-5 border border-slate-200/50">
                <p className="text-xs uppercase tracking-wider text-slate-500 font-medium mb-3">
                  Your Rhythm
                </p>
                <div className="flex items-baseline gap-3 mb-2">
                  <span className={`text-4xl font-light ${getRhythmColor(selectedEntry.rhythmScore)}`}>
                    {selectedEntry.rhythmScore}
                  </span>
                  <span className="text-lg text-slate-500">— {getRhythmLabel(selectedEntry.rhythmScore)}</span>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">Recovery</p>
                  <p className="text-2xl font-light text-slate-900">{selectedEntry.recoveryScore}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">Exposure</p>
                  <p className="text-2xl font-light text-slate-900">{selectedEntry.exposureScore}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}