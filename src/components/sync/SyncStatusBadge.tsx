import React, { useEffect, useState } from 'react';
import { Cloud, CloudOff, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { subscribeToSyncStatus, type SyncStatus } from '../../services/sync';
import type { SyncConflictRecord } from '../../types';

interface SyncStatusBadgeProps {
  onOpenConflictModal?: (conflicts: SyncConflictRecord[]) => void;
  onTriggerSync?: () => void;
}

export const SyncStatusBadge: React.FC<SyncStatusBadgeProps> = ({
  onOpenConflictModal,
  onTriggerSync,
}) => {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [message, setMessage] = useState('');
  const [conflicts, setConflicts] = useState<SyncConflictRecord[]>([]);

  useEffect(() => {
    return subscribeToSyncStatus((newStatus, newMsg, newConflicts) => {
      setStatus(newStatus);
      if (newMsg) setMessage(newMsg);
      if (newConflicts) setConflicts(newConflicts);
    });
  }, []);

  const handleClick = () => {
    if (status === 'conflict' && conflicts.length > 0) {
      onOpenConflictModal?.(conflicts);
    } else if (status !== 'syncing') {
      onTriggerSync?.();
    }
  };

  const renderContent = () => {
    switch (status) {
      case 'syncing':
        return (
          <>
            <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin" />
            <span className="text-blue-400 font-semibold hidden sm:inline">Syncing...</span>
          </>
        );
      case 'synced':
        return (
          <>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-emerald-400 font-semibold hidden sm:inline">Synced</span>
          </>
        );
      case 'conflict':
        return (
          <>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span className="text-amber-400 font-semibold hidden sm:inline">
              {conflicts.length} Conflict{conflicts.length > 1 ? 's' : ''}
            </span>
          </>
        );
      case 'offline':
        return (
          <>
            <CloudOff className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-slate-500 font-semibold hidden sm:inline">Offline</span>
          </>
        );
      case 'error':
        return (
          <>
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            <span className="text-rose-400 font-semibold hidden sm:inline">Sync Error</span>
          </>
        );
      case 'idle':
      default:
        return (
          <>
            <Cloud className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400 font-semibold hidden sm:inline">Cloud Ready</span>
          </>
        );
    }
  };

  return (
    <button
      onClick={handleClick}
      title={message || 'Google Drive Sync Status'}
      className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 text-xs transition"
    >
      {renderContent()}
    </button>
  );
};
