import { useState, useEffect } from "react";
import { TrendingUp, Zap, ChevronDown, ChevronUp, Plus, X } from "lucide-react";

interface Task {
  id: string;
  name: string;
  effort: "low" | "medium" | "high";
  deadline?: string;
}

export function TodayView() {
  const [intention, setIntention] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showTasks, setShowTasks] = useState(false);
  const [newTaskName, setNewTaskName] = useState("");
  const [isAddingTask, setIsAddingTask] = useState(false);

  // Base scores
  const recoveryScore = 82;
  const baseExposure = 65;
  
  // Calculate exposure based on tasks
  const taskExposureImpact = tasks.reduce((sum, task) => {
    if (task.effort === "low") return sum + 3;
    if (task.effort === "medium") return sum + 6;
    if (task.effort === "high") return sum + 10;
    return sum;
  }, 0);
  
  const exposureScore = Math.min(100, baseExposure + taskExposureImpact);

  // Calculate rhythm score (relationship between recovery and exposure)
  const rhythmScore = Math.round((recoveryScore + (100 - exposureScore)) / 2);

  const getRhythmLabel = (score: number) => {
    if (score >= 70) return "Steady";
    if (score >= 50) return "Balanced";
    return "Stretched";
  };

  const getRhythmInsight = (score: number) => {
    if (score >= 75) return "Your energy and workload are well matched today.";
    if (score >= 65) return "Your energy is steady. Protect one focused block if you can.";
    if (score >= 50) return "You may be slightly stretched — narrowing your focus could help.";
    return "Today might feel heavier than your baseline. Keep it simple.";
  };

  const getSuggestedApproach = (score: number) => {
    if (score >= 75) {
      return [
        "Start with one focused task before checking messages",
        "Use your steady energy for your most meaningful work",
        "Build in short transitions between activities"
      ];
    }
    if (score >= 65) {
      return [
        "Protect a short break between meetings",
        "Group smaller tasks together",
        "Reserve energy for what matters most"
      ];
    }
    if (score >= 50) {
      return [
        "Consider moving one high-effort item if today feels full",
        "Keep your intention narrow and specific",
        "Notice when you need a pause"
      ];
    }
    return [
      "Focus on one or two essential items",
      "Let go of what can wait",
      "Honor your energy level today"
    ];
  };

  const addTask = () => {
    if (newTaskName.trim()) {
      setTasks([...tasks, {
        id: Date.now().toString(),
        name: newTaskName,
        effort: "medium"
      }]);
      setNewTaskName("");
      setIsAddingTask(false);
    }
  };

  const updateTaskEffort = (id: string, effort: "low" | "medium" | "high") => {
    setTasks(tasks.map(task => task.id === id ? { ...task, effort } : task));
  };

  const removeTask = (id: string) => {
    setTasks(tasks.filter(task => task.id !== id));
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      {/* Top Section - State Overview */}
      <div className="grid grid-cols-2 gap-4 mb-16">
        {/* Recovery */}
        <div className="bg-white/60 rounded-2xl p-5 border border-slate-200/50 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-600/70" />
            <p className="text-xs uppercase tracking-wider text-slate-500 font-medium">
              Recovery
            </p>
          </div>
          <p className="text-3xl font-light text-slate-800">
            {recoveryScore}
          </p>
        </div>

        {/* Exposure */}
        <div className="bg-white/60 rounded-2xl p-5 border border-slate-200/50 shadow-sm transition-all duration-500">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-3.5 h-3.5 text-blue-600/70" />
            <p className="text-xs uppercase tracking-wider text-slate-500 font-medium">
              Exposure
            </p>
          </div>
          <p className="text-3xl font-light text-slate-800">
            {exposureScore}
          </p>
        </div>
      </div>

      {/* Central Section - Reflection Prompt */}
      <div className="text-center mb-12">
        <p className="text-xs uppercase tracking-wider text-slate-400 font-medium mb-6">
          Saturday, February 21
        </p>
        <h2 className="text-3xl font-medium text-slate-900 mb-8 leading-relaxed">
          What's your main priority today?
        </h2>
        
        <div className="max-w-lg mx-auto">
          <label className="text-xs uppercase tracking-wider text-slate-400 font-medium block mb-3">
            Primary Intention
          </label>
          <input
            type="text"
            value={intention}
            onChange={(e) => setIntention(e.target.value)}
            placeholder="What feels most important today?"
            className="w-full px-3 py-3 border-b border-slate-200 focus:border-slate-400 focus:outline-none bg-transparent text-slate-900 text-base placeholder:text-slate-300 transition-colors text-center"
          />
        </div>
      </div>

      {/* Expandable Tasks Section */}
      <div className="mb-8">
        <button
          onClick={() => setShowTasks(!showTasks)}
          className="w-full bg-white/60 rounded-2xl p-4 border border-slate-200/50 shadow-sm hover:shadow-md transition-all flex items-center justify-between group"
        >
          <span className="text-sm font-medium text-slate-700">Tasks</span>
          <div className="flex items-center gap-2">
            {tasks.length > 0 && (
              <span className="text-xs text-slate-400">{tasks.length}</span>
            )}
            {showTasks ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400 group-hover:translate-y-0.5 transition-transform" />
            )}
          </div>
        </button>

        {showTasks && (
          <div className="mt-3 bg-white/60 rounded-2xl p-5 border border-slate-200/50 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="space-y-3 mb-4">
              {tasks.map((task) => (
                <div key={task.id} className="flex items-start gap-3 pb-3 border-b border-slate-100 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-800 mb-2">{task.name}</p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateTaskEffort(task.id, "low")}
                        className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                          task.effort === "low"
                            ? "bg-emerald-100 text-emerald-700 font-medium"
                            : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                        }`}
                      >
                        Low
                      </button>
                      <button
                        onClick={() => updateTaskEffort(task.id, "medium")}
                        className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                          task.effort === "medium"
                            ? "bg-blue-100 text-blue-700 font-medium"
                            : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                        }`}
                      >
                        Medium
                      </button>
                      <button
                        onClick={() => updateTaskEffort(task.id, "high")}
                        className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                          task.effort === "high"
                            ? "bg-amber-100 text-amber-700 font-medium"
                            : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                        }`}
                      >
                        High
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => removeTask(task.id)}
                    className="w-6 h-6 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors flex-shrink-0"
                  >
                    <X className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                </div>
              ))}
            </div>

            {isAddingTask ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newTaskName}
                  onChange={(e) => setNewTaskName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addTask();
                    if (e.key === 'Escape') {
                      setIsAddingTask(false);
                      setNewTaskName("");
                    }
                  }}
                  placeholder="Task name..."
                  autoFocus
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg focus:border-slate-400 focus:outline-none bg-white text-sm text-slate-900 placeholder:text-slate-300"
                />
                <button
                  onClick={addTask}
                  className="px-4 py-2 bg-slate-900 text-white text-sm rounded-lg hover:bg-slate-800 transition-colors"
                >
                  Add
                </button>
                <button
                  onClick={() => {
                    setIsAddingTask(false);
                    setNewTaskName("");
                  }}
                  className="px-3 py-2 text-slate-500 text-sm hover:text-slate-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsAddingTask(true)}
                className="w-full py-2 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 hover:text-slate-700 hover:border-slate-400 transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add task
              </button>
            )}
          </div>
        )}
      </div>

      {/* Your Rhythm Card */}
      {intention && (
        <div className="mb-6 animate-in fade-in slide-in-from-bottom-3 duration-500">
          <div className="bg-gradient-to-br from-slate-50 to-white rounded-2xl p-6 border border-slate-200/50 shadow-sm">
            <p className="text-xs uppercase tracking-wider text-slate-500 font-medium mb-4">
              Your Rhythm
            </p>
            <div className="flex items-baseline gap-3 mb-4">
              <span className="text-4xl font-light text-slate-900">{rhythmScore}</span>
              <span className="text-lg text-slate-500">— {getRhythmLabel(rhythmScore)}</span>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              {getRhythmInsight(rhythmScore)}
            </p>
          </div>
        </div>
      )}

      {/* Suggested Approach */}
      {intention && (
        <div className="animate-in fade-in slide-in-from-bottom-3 duration-500 delay-150">
          <div className="bg-white/60 rounded-2xl p-6 border border-slate-200/50 shadow-sm">
            <p className="text-xs uppercase tracking-wider text-slate-500 font-medium mb-4">
              Suggested Approach
            </p>
            <ul className="space-y-2.5">
              {getSuggestedApproach(rhythmScore).map((suggestion, index) => (
                <li key={index} className="text-sm text-slate-600 leading-relaxed flex items-start gap-2">
                  <span className="text-slate-400 mt-0.5">•</span>
                  <span>{suggestion}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
