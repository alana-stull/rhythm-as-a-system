import { Link } from "react-router";
import { Sparkles, Activity, Heart } from "lucide-react";

export function VariationSelector() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center space-y-3">
          <h1 className="text-4xl font-light tracking-tight text-slate-900">
            Rhythm
          </h1>
          <p className="text-slate-600 text-sm">
            Choose a design variation
          </p>
        </div>

        <div className="space-y-4">
          <Link
            to="/minimal"
            className="block bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-all border border-slate-200 hover:border-slate-300"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-slate-700" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-slate-900">Minimal + Editorial</h3>
                <p className="text-sm text-slate-500">Clean, spacious, typography-focused</p>
              </div>
            </div>
          </Link>

          <Link
            to="/data"
            className="block bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-all border border-slate-200 hover:border-slate-300"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                <Activity className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-slate-900">Data-Forward + Technical</h3>
                <p className="text-sm text-slate-500">Metrics-driven, detailed insights</p>
              </div>
            </div>
          </Link>

          <Link
            to="/warm"
            className="block bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-all border border-slate-200 hover:border-slate-300"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center">
                <Heart className="w-6 h-6 text-amber-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-slate-900">Warm + Human-Centered</h3>
                <p className="text-sm text-slate-500">Encouraging, supportive, welcoming</p>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
