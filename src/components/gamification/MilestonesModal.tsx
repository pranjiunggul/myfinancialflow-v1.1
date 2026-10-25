import React from 'react';
import { X, Award, Flame, Sparkles, Zap, Target, TrendingUp, CheckCircle2, Lock } from 'lucide-react';
import type { Achievement, GamificationStreaks } from '../../types';
import { MILESTONE_DEFINITIONS } from '../../services/gamification';

interface MilestonesModalProps {
  isOpen: boolean;
  onClose: () => void;
  streaks: GamificationStreaks;
  unlockedAchievements: Achievement[];
}

const ICON_MAP: Record<string, any> = {
  Sparkles,
  Flame,
  Award,
  Zap,
  Target,
  TrendingUp,
};

export const MilestonesModal: React.FC<MilestonesModalProps> = ({
  isOpen,
  onClose,
  streaks,
  unlockedAchievements,
}) => {
  if (!isOpen) return null;

  const unlockedMap = new Map(unlockedAchievements.map((a) => [a.id, a]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Habits & Milestones</h2>
              <p className="text-xs text-slate-400">Local-only personal finance tracking habits</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Streaks Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl flex items-center space-x-3.5">
              <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl">
                <Flame className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] text-slate-400 uppercase font-medium">Current Streak</span>
                <div className="text-xl font-bold text-white">
                  {streaks.currentLoggingStreak} {streaks.currentLoggingStreak === 1 ? 'day' : 'days'}
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl flex items-center space-x-3.5">
              <div className="p-3 bg-purple-500/10 text-purple-400 rounded-xl">
                <Award className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] text-slate-400 uppercase font-medium">Longest Streak</span>
                <div className="text-xl font-bold text-white">
                  {streaks.longestLoggingStreak} {streaks.longestLoggingStreak === 1 ? 'day' : 'days'}
                </div>
              </div>
            </div>
          </div>

          {/* Milestone Badges List */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Milestone Badges ({unlockedAchievements.length} of {MILESTONE_DEFINITIONS.length} Unlocked)
            </h3>

            <div className="space-y-2.5">
              {MILESTONE_DEFINITIONS.map((milestone) => {
                const isUnlocked = unlockedMap.has(milestone.id);
                const IconComponent = ICON_MAP[milestone.icon] || Award;

                return (
                  <div
                    key={milestone.id}
                    className={`p-3.5 rounded-xl border flex items-center justify-between transition ${
                      isUnlocked
                        ? 'bg-slate-950/80 border-slate-800 text-white'
                        : 'bg-slate-950/30 border-slate-900 text-slate-500 opacity-60'
                    }`}
                  >
                    <div className="flex items-center space-x-3.5">
                      <div
                        className={`p-2.5 rounded-xl ${
                          isUnlocked
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-slate-900 text-slate-600'
                        }`}
                      >
                        <IconComponent className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h4 className="text-sm font-bold text-slate-200">{milestone.title}</h4>
                          {isUnlocked && (
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full font-medium">
                              Unlocked
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{milestone.description}</p>
                      </div>
                    </div>

                    <div>
                      {isUnlocked ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      ) : (
                        <Lock className="w-4 h-4 text-slate-600 shrink-0" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
