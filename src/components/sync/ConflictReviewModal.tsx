import React, { useState } from 'react';
import { X, AlertTriangle, RotateCcw, Copy, Trash2, CheckCircle, Split } from 'lucide-react';
import type { SyncConflictRecord, SyncDuplicatePair } from '../../types';
import { restoreSupersededConflictRecord } from '../../services/sync';
import { resolveDuplicatePair } from '../../services/syncDuplicates';

interface ConflictReviewModalProps {
  conflicts: SyncConflictRecord[];
  duplicates?: SyncDuplicatePair[];
  initialTab?: 'conflicts' | 'duplicates';
  onClose: () => void;
  onConflictResolved?: () => void;
}

export const ConflictReviewModal: React.FC<ConflictReviewModalProps> = ({
  conflicts,
  duplicates = [],
  initialTab = 'conflicts',
  onClose,
  onConflictResolved,
}) => {
  const [activeTab, setActiveTab] = useState<'conflicts' | 'duplicates'>(
    initialTab === 'duplicates' || (conflicts.length === 0 && duplicates.length > 0)
      ? 'duplicates'
      : 'conflicts'
  );
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [resolvingDupId, setResolvingDupId] = useState<string | null>(null);
  const [dupList, setDupList] = useState<SyncDuplicatePair[]>(duplicates);

  const handleRestore = async (conflict: SyncConflictRecord) => {
    setRestoringId(conflict.id);
    try {
      await restoreSupersededConflictRecord(conflict);
      onConflictResolved?.();
    } catch (err: any) {
      alert('Failed to restore record: ' + err.message);
    } finally {
      setRestoringId(null);
    }
  };

  const handleResolveDuplicate = async (
    pairId: string,
    action: 'keep_local' | 'keep_remote' | 'keep_both'
  ) => {
    setResolvingDupId(pairId);
    try {
      await resolveDuplicatePair(pairId, action);
      setDupList((prev) => prev.filter((d) => d.id !== pairId));
      onConflictResolved?.();
    } catch (err: any) {
      alert('Failed to resolve duplicate: ' + err.message);
    } finally {
      setResolvingDupId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-400">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Sync Review & Conflict Manager</h3>
              <p className="text-xs text-slate-400">
                Review concurrent edit conflicts and cross-device duplicate transactions.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 px-6 pt-2 bg-slate-950/40">
          <button
            onClick={() => setActiveTab('conflicts')}
            className={`flex items-center space-x-2 py-3 px-4 border-b-2 font-semibold text-xs sm:text-sm transition ${
              activeTab === 'conflicts'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Split className="w-4 h-4" />
            <span>Concurrent Edits (LWW)</span>
            <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300">
              {conflicts.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('duplicates')}
            className={`flex items-center space-x-2 py-3 px-4 border-b-2 font-semibold text-xs sm:text-sm transition ${
              activeTab === 'duplicates'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Copy className="w-4 h-4" />
            <span>Cross-Device Duplicates</span>
            <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300">
              {dupList.length}
            </span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          {activeTab === 'conflicts' ? (
            /* Tab 1: Concurrent Edits */
            conflicts.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">
                No active edit conflicts detected. All records are synchronized via Last-Write-Wins.
              </div>
            ) : (
              conflicts.map((conflict) => {
                const winning = conflict.winningRecord || {};
                const superseded = conflict.supersededVersion || {};

                return (
                  <div
                    key={conflict.id}
                    className="p-5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase tracking-wider font-bold px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-400">
                        {conflict.entityType} Conflict
                      </span>
                      <span className="text-xs text-slate-500 font-mono">
                        {new Date(conflict.resolvedAt).toLocaleTimeString()}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 font-medium">
                      {conflict.reason}
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2">
                      {/* Winning Record */}
                      <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-1">
                        <div className="flex items-center justify-between text-emerald-400 font-bold">
                          <span>Active ({conflict.winningSide === 'local' ? 'Local' : 'Remote'})</span>
                          <span>Winner</span>
                        </div>
                        <div className="font-mono text-slate-300 truncate">
                          Desc: {winning.description || winning.name || winning.title || winning.personName || winning.id}
                        </div>
                        <div className="font-mono text-slate-400">
                          Amount: {winning.amount ?? winning.originalAmount ?? winning.currentBalance ?? '-'}
                        </div>
                      </div>

                      {/* Superseded Record */}
                      <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-1">
                        <div className="flex items-center justify-between text-slate-400 font-bold">
                          <span>Superseded ({conflict.winningSide === 'local' ? 'Remote' : 'Local'})</span>
                          <span>Archived</span>
                        </div>
                        <div className="font-mono text-slate-300 truncate">
                          Desc: {superseded.description || superseded.name || superseded.title || superseded.personName || superseded.id}
                        </div>
                        <div className="font-mono text-slate-400">
                          Amount: {superseded.amount ?? superseded.originalAmount ?? superseded.currentBalance ?? '-'}
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 flex justify-end">
                      <button
                        onClick={() => handleRestore(conflict)}
                        disabled={restoringId === conflict.id}
                        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold border border-slate-700 transition"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-blue-400" />
                        <span>{restoringId === conflict.id ? 'Restoring...' : 'Restore Superseded Version'}</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )
          ) : (
            /* Tab 2: Cross-Device Duplicates */
            dupList.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">
                No potential cross-device duplicate transactions detected.
              </div>
            ) : (
              dupList.map((dup) => {
                const loc = dup.localTransactionSnapshot;
                const rem = dup.remoteTransactionSnapshot;
                const isResolving = resolvingDupId === dup.id;

                return (
                  <div
                    key={dup.id}
                    className="p-5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs uppercase tracking-wider font-bold px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-400">
                          ⚠️ Possible Duplicate ({Math.round(dup.similarityScore * 100)}% match)
                        </span>
                      </div>
                      <span className="text-xs text-slate-500 font-mono">
                        {new Date(dup.detectedAt).toLocaleTimeString()}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300">
                      Two separate transactions created independently on different devices during a sync delay window appear to represent the same real-world expense/income:
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {/* Local Transaction */}
                      <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-700/70 space-y-1.5">
                        <div className="flex items-center justify-between text-blue-400 font-bold">
                          <span>Side A (This Device)</span>
                          <span className="text-slate-500 font-mono text-[10px]">{loc.date}</span>
                        </div>
                        <div className="font-semibold text-white truncate text-sm">
                          {loc.description}
                        </div>
                        <div className="font-mono text-emerald-400 font-bold text-sm">
                          {loc.amount.toLocaleString()} {loc.currency}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          ID: <span className="font-mono text-slate-500">{loc.id}</span>
                        </div>
                      </div>

                      {/* Remote Transaction */}
                      <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-700/70 space-y-1.5">
                        <div className="flex items-center justify-between text-purple-400 font-bold">
                          <span>Side B (Remote Synced Device)</span>
                          <span className="text-slate-500 font-mono text-[10px]">{rem.date}</span>
                        </div>
                        <div className="font-semibold text-white truncate text-sm">
                          {rem.description}
                        </div>
                        <div className="font-mono text-emerald-400 font-bold text-sm">
                          {rem.amount.toLocaleString()} {rem.currency}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          ID: <span className="font-mono text-slate-500">{rem.id}</span>
                        </div>
                      </div>
                    </div>

                    {/* Resolution Actions */}
                    <div className="flex flex-wrap items-center justify-end gap-2 pt-1 border-t border-slate-800/80">
                      <button
                        onClick={() => handleResolveDuplicate(dup.id, 'keep_local')}
                        disabled={isResolving}
                        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-xs font-semibold border border-blue-500/30 transition disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-blue-400" />
                        <span>Keep Side A (Delete Side B)</span>
                      </button>

                      <button
                        onClick={() => handleResolveDuplicate(dup.id, 'keep_remote')}
                        disabled={isResolving}
                        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 text-xs font-semibold border border-purple-500/30 transition disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-purple-400" />
                        <span>Keep Side B (Delete Side A)</span>
                      </button>

                      <button
                        onClick={() => handleResolveDuplicate(dup.id, 'keep_both')}
                        disabled={isResolving}
                        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition disabled:opacity-50"
                      >
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Keep Both (Distinct)</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-semibold transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
