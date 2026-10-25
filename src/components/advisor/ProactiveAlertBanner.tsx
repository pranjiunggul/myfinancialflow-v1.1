import React, { useEffect, useState } from 'react';
import { AlertTriangle, AlertCircle, Info, X, ArrowRight } from 'lucide-react';
import { subscribeToProactiveAlerts, dismissAlert } from '../../services/advisor';
import type { ProactiveAlertItem } from '../../types';

interface ProactiveAlertBannerProps {
  onNavigateTab?: (tab: string) => void;
}

export const ProactiveAlertBanner: React.FC<ProactiveAlertBannerProps> = ({ onNavigateTab }) => {
  const [alerts, setAlerts] = useState<ProactiveAlertItem[]>([]);

  useEffect(() => {
    return subscribeToProactiveAlerts((updated) => {
      setAlerts(updated);
    });
  }, []);

  if (alerts.length === 0) return null;

  // Show top alert
  const topAlert = alerts[0];

  const severityStyle =
    topAlert.severity === 'critical'
      ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
      : topAlert.severity === 'warning'
      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
      : 'bg-blue-500/10 border-blue-500/30 text-blue-300';

  const icon =
    topAlert.severity === 'critical' ? (
      <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
    ) : topAlert.severity === 'warning' ? (
      <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
    ) : (
      <Info className="w-5 h-5 text-blue-400 shrink-0" />
    );

  return (
    <div className={`p-4 rounded-2xl border ${severityStyle} flex items-center justify-between text-xs animate-fade-in shadow-lg`}>
      <div className="flex items-center space-x-3 pr-2">
        {icon}
        <div className="space-y-0.5">
          <div className="font-bold text-white flex items-center space-x-2">
            <span>{topAlert.title}</span>
            {alerts.length > 1 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300">
                +{alerts.length - 1} more
              </span>
            )}
          </div>
          <p className="text-slate-300 text-[11px] leading-relaxed">
            {topAlert.message}
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-2 shrink-0">
        {topAlert.linkAction && onNavigateTab && (
          <button
            onClick={() => onNavigateTab(topAlert.linkAction!)}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-white font-semibold border border-slate-700/60 transition"
          >
            <span>Review</span>
            <ArrowRight className="w-3 h-3 text-slate-400" />
          </button>
        )}

        <button
          onClick={() => dismissAlert(topAlert.id)}
          className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition"
          title="Dismiss alert"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
