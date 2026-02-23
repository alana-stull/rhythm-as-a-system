import { Outlet, Link, useLocation } from "react-router";
import { useState } from "react";
import { X } from "lucide-react";

export function DashboardLayout() {
  const location = useLocation();
  const [showOuraModal, setShowOuraModal] = useState(false);

  const isActive = (path: string) => {
    if (path === "/" && location.pathname === "/") return true;
    if (path !== "/" && location.pathname.startsWith(path)) return true;
    return false;
  };

  return (
    <div className="min-h-screen bg-[#F9F9F7]">
      {/* Top Navigation */}
      <nav className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-normal text-slate-900">rhythm</h1>
            
            {/* Oura Ring Badge */}
            <button
              onClick={() => setShowOuraModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 rounded-full border border-slate-200 transition-colors"
            >
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-xs text-slate-600">Oura</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/"
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive("/")
                  ? "bg-slate-100 text-slate-900"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              Today
            </Link>
            <Link
              to="/history"
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive("/history")
                  ? "bg-slate-100 text-slate-900"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              History
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <Outlet />

      {/* Oura Ring Modal */}
      {showOuraModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-xl font-medium text-slate-900 mb-1">Oura Ring Data</h2>
                <p className="text-sm text-slate-500">Your biometric insights</p>
              </div>
              <button
                onClick={() => setShowOuraModal(false)}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4 text-slate-600" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Recovery Details */}
              <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                <p className="text-xs uppercase tracking-wider text-emerald-900 font-medium mb-3">Recovery</p>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-emerald-900/70">HRV Balance</span>
                    <span className="text-sm font-medium text-emerald-900">Optimal</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-emerald-900/70">Resting Heart Rate</span>
                    <span className="text-sm font-medium text-emerald-900">58 bpm</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-emerald-900/70">Sleep Score</span>
                    <span className="text-sm font-medium text-emerald-900">85/100</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-emerald-900/70">Body Temperature</span>
                    <span className="text-sm font-medium text-emerald-900">Normal</span>
                  </div>
                </div>
              </div>

              {/* Activity Details */}
              <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                <p className="text-xs uppercase tracking-wider text-blue-900 font-medium mb-3">Activity</p>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-blue-900/70">Steps</span>
                    <span className="text-sm font-medium text-blue-900">6,842</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-blue-900/70">Active Calories</span>
                    <span className="text-sm font-medium text-blue-900">420 kcal</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-blue-900/70">Activity Goal</span>
                    <span className="text-sm font-medium text-blue-900">78%</span>
                  </div>
                </div>
              </div>

              {/* Readiness */}
              <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
                <p className="text-xs uppercase tracking-wider text-purple-900 font-medium mb-3">Readiness</p>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-purple-900/70">Overall Score</span>
                    <span className="text-sm font-medium text-purple-900">82/100</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-purple-900/70">Last Sync</span>
                    <span className="text-sm font-medium text-purple-900">2 min ago</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}