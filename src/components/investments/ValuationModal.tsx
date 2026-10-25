import React, { useState } from 'react';
import { X, TrendingUp, AlertCircle } from 'lucide-react';
import type { InvestmentAsset } from '../../types';
import { updateAssetValuation } from '../../services/investments';
import { formatCurrency } from '../../services/fx';

interface ValuationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  asset: InvestmentAsset | null;
}

export const ValuationModal: React.FC<ValuationModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  asset,
}) => {
  const [newValue, setNewValue] = useState(asset ? String(asset.currentValue) : '');
  const [valDate, setValDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !asset) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsed = parseFloat(newValue);
    if (isNaN(parsed) || parsed < 0) {
      setError('Please enter a valid non-negative valuation amount.');
      return;
    }

    setIsSubmitting(true);
    try {
      await updateAssetValuation(asset.id, parsed, {
        date: valDate,
        notes: notes.trim() || undefined,
        source: 'manual',
      });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to update valuation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Update Valuation</h2>
              <p className="text-xs text-slate-400">{asset.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-center space-x-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs space-y-1">
            <div className="flex justify-between text-slate-400">
              <span>Cost Basis:</span>
              <span className="text-white font-medium">{formatCurrency(asset.costBasis, asset.currency)}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Previous Valuation:</span>
              <span className="text-indigo-400 font-medium">{formatCurrency(asset.currentValue, asset.currency)}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              New Total Market Value ({asset.currency})
            </label>
            <input
              type="number"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="0"
              min="0"
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
              autoFocus
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Valuation Date</label>
            <input
              type="date"
              value={valDate}
              onChange={(e) => setValDate(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500 text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Note (Optional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Monthly statement check, dividend reinvestment"
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
            />
          </div>

          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 text-xs font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition shadow-lg shadow-indigo-600/20 disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Record Valuation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
