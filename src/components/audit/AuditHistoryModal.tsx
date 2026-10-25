import React from 'react';
import { X, History, Clock, Smartphone } from 'lucide-react';
import type { AuditLog } from '../../types';

interface AuditHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: AuditLog[];
}

export const AuditHistoryModal: React.FC<AuditHistoryModalProps> = ({
  isOpen,
  onClose,
  logs,
}) => {
  if (!isOpen) return null;

  const sortedLogs = [...logs].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Audit Log & Conflict History</h2>
              <p className="text-xs text-slate-400">
                Detailed record of all transactions, edits, and device sync events
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-3">
          {sortedLogs.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              No audit logs recorded yet.
            </div>
          ) : (
            sortedLogs.map((log) => {
              const dateStr = new Date(log.timestamp).toLocaleString();
              const isSoftDelete = log.action === 'soft_delete';
              const isCreate = log.action === 'create';

              return (
                <div
                  key={log.id}
                  className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex items-start justify-between text-xs space-x-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span
                        className={`px-2 py-0.5 rounded font-mono uppercase text-[10px] font-bold ${
                          isCreate
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : isSoftDelete
                            ? 'bg-rose-500/20 text-rose-400'
                            : 'bg-blue-500/20 text-blue-400'
                        }`}
                      >
                        {log.action}
                      </span>
                      <span className="font-semibold text-slate-300 capitalize">
                        {log.entityType}
                      </span>
                    </div>

                    <p className="text-slate-200 font-medium leading-relaxed">
                      {log.changeSummary}
                    </p>

                    <div className="flex items-center space-x-3 text-slate-400 text-[11px] font-mono">
                      <span className="flex items-center space-x-1">
                        <Clock className="w-3 h-3" />
                        <span>{dateStr}</span>
                      </span>
                      <span className="flex items-center space-x-1">
                        <Smartphone className="w-3 h-3" />
                        <span>{log.deviceId}</span>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/60 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
