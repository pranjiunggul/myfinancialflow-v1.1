import React, { useState } from 'react';
import { Flame, Award, ChevronRight, X } from 'lucide-react';
import type { Achievement, GamificationStreaks } from '../../types';
import { MilestonesModal } from './MilestonesModal';

interface GamificationBarProps {
  streaks: GamificationStreaks;
  unlockedAchievements: Achievement[];
}

export const GamificationBar: React.FC<GamificationBarProps> = ({
  streaks,
  unlockedAchievements,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  // If user has zero streak and zero achievements, hide banner
  if (isDismissed || (streaks.currentLoggingStreak === 0 && unlockedAchievements.length === 0)) {
    return null;
  }

  return (
    <>
      <div className="bg-gradient-to-r from-amber-500/10 via-purple-500/10 to-amber-500/10 border border-amber-500/20 rounded-2xl p-3 sm:px-4 flex items-center justify-between shadow-sm">
        <div
          onClick={() => setIsModalOpen(true)}
          className="flex items-center space-x-3 cursor-pointer group flex-1"
        >
          <div className="p-1.5 bg-amber-500/20 text-amber-400 rounded-lg group-hover:scale-110 transition-transform">
            <Flame className="w-4 h-4" />
          </div>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
            <span className="font-bold text-amber-300">
              {streaks.currentLoggingStreak} {streaks.currentLoggingStreak === 1 ? 'Day' : 'Days'} Streak
            </span>
            <span className="text-slate-600 hidden sm:inline">•</span>
            <span className="text-slate-300 flex items-center space-x-1">
              <Award className="w-3.5 h-3.5 text-purple-400 inline" />
              <span>{unlockedAchievements.length} Milestones Unlocked</span>
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={() => setIsModalOpen(true)}
            className="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center space-x-0.5 px-2 py-1 rounded-lg hover:bg-amber-500/10 transition"
          >
            <span>View</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsDismissed(true)}
            className="p-1 text-slate-500 hover:text-slate-400 rounded-lg hover:bg-slate-800 transition"
            title="Dismiss for this session"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <MilestonesModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        streaks={streaks}
        unlockedAchievements={unlockedAchievements}
      />
    </>
  );
};
