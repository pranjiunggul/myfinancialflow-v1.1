import React, { useState } from 'react';
import { X, TrendingUp, AlertCircle, RefreshCw, Info } from 'lucide-react';
import type { InvestmentAsset, InvestmentAssetType, CurrencyCode } from '../../types';
import { createInvestmentAsset, updateInvestmentAsset, fetchLiveCryptoPrice } from '../../services/investments';

interface AssetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  baseCurrency: CurrencyCode;
  assetToEdit?: InvestmentAsset | null;
}

const ASSET_TYPES: { type: InvestmentAssetType; label: string; icon: string }[] = [
  { type: 'stocks', label: 'Stocks / Equities', icon: '📈' },
  { type: 'mutual_funds', label: 'Mutual Funds / Reksadana', icon: '📊' },
  { type: 'crypto', label: 'Cryptocurrency', icon: '🪙' },
  { type: 'gold_metals', label: 'Gold & Metals', icon: '🥇' },
  { type: 'property', label: 'Real Estate / Property', icon: '🏠' },
  { type: 'other', label: 'Other Asset', icon: '💼' },
];

export const AssetModal: React.FC<AssetModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  baseCurrency,
  assetToEdit,
}) => {
  const [type, setType] = useState<InvestmentAssetType>(assetToEdit?.type || 'stocks');
  const [name, setName] = useState(assetToEdit?.name || '');
  const [tickerSymbol, setTickerSymbol] = useState(assetToEdit?.tickerSymbol || '');
  const [quantity, setQuantity] = useState(assetToEdit?.quantity ? String(assetToEdit.quantity) : '');
  const [costBasis, setCostBasis] = useState(assetToEdit?.costBasis ? String(assetToEdit.costBasis) : '');
  const [currentValue, setCurrentValue] = useState(assetToEdit?.currentValue ? String(assetToEdit.currentValue) : '');
  const [currency, setCurrency] = useState<CurrencyCode>(assetToEdit?.currency || baseCurrency);
  const [lastValuationDate, setLastValuationDate] = useState(
    assetToEdit?.lastValuationDate || new Date().toISOString().slice(0, 10)
  );
  const [notes, setNotes] = useState(assetToEdit?.notes || '');
  const [includeInNetWorth, setIncludeInNetWorth] = useState(
    assetToEdit?.includeInNetWorth !== undefined ? assetToEdit.includeInNetWorth : true
  );
  const [isFetchingPrice, setIsFetchingPrice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleCryptoPriceSync = async () => {
    if (!tickerSymbol.trim()) {
      setError('Enter a crypto ticker (e.g. BTC, ETH, SOL) to fetch price.');
      return;
    }
    setIsFetchingPrice(true);
    setError(null);
    try {
      const priceUsd = await fetchLiveCryptoPrice(tickerSymbol);
      if (priceUsd !== null) {
        const qty = parseFloat(quantity) || 1;
        if (currency === 'USD') {
          setCurrentValue((qty * priceUsd).toFixed(2));
        } else {
          // Assume IDR: multiply by ~16,250
          setCurrentValue(Math.round(qty * priceUsd * 16250).toString());
        }
        setLastValuationDate(new Date().toISOString().slice(0, 10));
      } else {
        setError(`Could not fetch live price for "${tickerSymbol}". You can enter current value manually.`);
      }
    } catch (e: any) {
      setError('Live price lookup failed. Enter valuation manually.');
    } finally {
      setIsFetchingPrice(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Please provide an asset name.');
      return;
    }

    const parsedCost = parseFloat(costBasis);
    const parsedValue = parseFloat(currentValue);
    const parsedQty = quantity ? parseFloat(quantity) : undefined;

    if (isNaN(parsedCost) || parsedCost < 0) {
      setError('Cost basis must be a non-negative number.');
      return;
    }
    if (isNaN(parsedValue) || parsedValue < 0) {
      setError('Current valuation must be a non-negative number.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (assetToEdit) {
        await updateInvestmentAsset(assetToEdit.id, {
          type,
          name: name.trim(),
          tickerSymbol: tickerSymbol.trim() || undefined,
          quantity: parsedQty,
          costBasis: parsedCost,
          currentValue: parsedValue,
          currency,
          lastValuationDate,
          notes: notes.trim() || undefined,
          includeInNetWorth,
        });
      } else {
        await createInvestmentAsset({
          type,
          name: name.trim(),
          tickerSymbol: tickerSymbol.trim() || undefined,
          quantity: parsedQty,
          costBasis: parsedCost,
          currentValue: parsedValue,
          currency,
          lastValuationDate,
          notes: notes.trim() || undefined,
          includeInNetWorth,
        });
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save asset.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {assetToEdit ? 'Edit Non-Cash Asset' : 'New Non-Cash Asset'}
              </h2>
              <p className="text-xs text-slate-400">Track stocks, crypto, gold, and properties</p>
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {error && (
            <div className="flex items-center space-x-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Asset Type Grid */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Asset Class</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ASSET_TYPES.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => setType(item.type)}
                  className={`p-2.5 rounded-xl border text-left text-xs font-medium transition flex items-center space-x-2 ${
                    type === item.type
                      ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white'
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Asset Name & Ticker */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Asset Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. BBCA, Antam Gold, Bitcoin, Rumah BSD"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Ticker / Code</label>
              <input
                type="text"
                value={tickerSymbol}
                onChange={(e) => setTickerSymbol(e.target.value.toUpperCase())}
                placeholder="e.g. BTC, BBCA"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
              />
            </div>
          </div>

          {/* Quantity & Currency */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Quantity / Units (Optional)</label>
              <input
                type="number"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="e.g. 0.05, 500, 25"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500 text-sm"
              >
                <option value="IDR">IDR (Rp)</option>
                <option value="USD">USD ($)</option>
                <option value="SGD">SGD (S$)</option>
                <option value="EUR">EUR (€)</option>
              </select>
            </div>
          </div>

          {/* Cost Basis & Current Value */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Total Cost Basis ({currency})
              </label>
              <input
                type="number"
                value={costBasis}
                onChange={(e) => setCostBasis(e.target.value)}
                placeholder="Total invested amount"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
                required
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-300">
                  Current Value ({currency})
                </label>
                {type === 'crypto' && (
                  <button
                    type="button"
                    onClick={handleCryptoPriceSync}
                    disabled={isFetchingPrice}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center space-x-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${isFetchingPrice ? 'animate-spin' : ''}`} />
                    <span>Sync Live Price</span>
                  </button>
                )}
              </div>
              <input
                type="number"
                value={currentValue}
                onChange={(e) => setCurrentValue(e.target.value)}
                placeholder="Current market valuation"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
                required
              />
            </div>
          </div>

          {/* Valuation Note / Guidance */}
          {type !== 'crypto' ? (
            <div className="flex items-center space-x-2 p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-400 text-xs">
              <Info className="w-4 h-4 shrink-0 text-slate-500" />
              <span>
                <strong>Manual Valuation (Offline):</strong> Update current value periodically whenever you review statements. No external API keys needed.
              </span>
            </div>
          ) : (
            <div className="flex items-center space-x-2 p-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-300 text-xs">
              <Info className="w-4 h-4 shrink-0 text-indigo-400" />
              <span>
                Crypto assets support optional public live price lookups (CoinCap public feed) with offline caching.
              </span>
            </div>
          )}

          {/* Last Valuation Date */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Valuation Date</label>
            <input
              type="date"
              value={lastValuationDate}
              onChange={(e) => setLastValuationDate(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500 text-sm"
              required
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Notes (Optional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Mandiri Sekuritas, cold storage in Ledger, 24K certificate"
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
            />
          </div>

          {/* Include in Net Worth toggle */}
          <div className="flex items-center space-x-3 pt-2">
            <input
              type="checkbox"
              id="includeInNetWorth"
              checked={includeInNetWorth}
              onChange={(e) => setIncludeInNetWorth(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-500 focus:ring-0 bg-slate-950 border-slate-800"
            />
            <label htmlFor="includeInNetWorth" className="text-xs text-slate-300 cursor-pointer">
              Include this asset in total Net Worth calculation
            </label>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 text-sm font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition shadow-lg shadow-indigo-600/20 disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : assetToEdit ? 'Save Changes' : 'Add Asset'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
