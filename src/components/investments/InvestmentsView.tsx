import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Plus,
  Edit2,
  Trash2,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import type { InvestmentAsset, CurrencyCode } from '../../types';
import {
  getActiveInvestmentAssets,
  deleteInvestmentAsset,
  calculateInvestmentsTotal,
} from '../../services/investments';
import { AssetModal } from './AssetModal';
import { ValuationModal } from './ValuationModal';
import { formatCurrency } from '../../services/fx';

interface InvestmentsViewProps {
  baseCurrency: CurrencyCode;
}

const TYPE_LABELS: Record<string, { label: string; icon: string }> = {
  stocks: { label: 'Stocks / Equities', icon: '📈' },
  mutual_funds: { label: 'Mutual Funds / Reksadana', icon: '📊' },
  crypto: { label: 'Cryptocurrency', icon: '🪙' },
  gold_metals: { label: 'Gold & Metals', icon: '🥇' },
  property: { label: 'Property / Real Estate', icon: '🏠' },
  other: { label: 'Other Asset', icon: '💼' },
};

export const InvestmentsView: React.FC<InvestmentsViewProps> = ({ baseCurrency }) => {
  const [assets, setAssets] = useState<InvestmentAsset[]>([]);
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [assetToEdit, setAssetToEdit] = useState<InvestmentAsset | null>(null);
  const [isValuationModalOpen, setIsValuationModalOpen] = useState(false);
  const [selectedAssetForValuation, setSelectedAssetForValuation] = useState<InvestmentAsset | null>(null);

  const loadAssets = async () => {
    const list = await getActiveInvestmentAssets();
    setAssets(list);
  };

  useEffect(() => {
    loadAssets();
  }, []);

  const handleDelete = async (asset: InvestmentAsset) => {
    if (confirm(`Are you sure you want to delete "${asset.name}"?`)) {
      await deleteInvestmentAsset(asset.id);
      loadAssets();
    }
  };

  const totalPortfolioValue = calculateInvestmentsTotal(assets, baseCurrency, 16250);
  const totalCostBasis = assets
    .filter((a) => !a.isDeleted && a.includeInNetWorth)
    .reduce((sum, a) => {
      const rate = a.currency === baseCurrency ? 1.0 : a.currency === 'USD' ? 16250 : 1.0;
      return sum + a.costBasis * rate;
    }, 0);

  const totalGainLoss = totalPortfolioValue - totalCostBasis;
  const totalGainLossPercent = totalCostBasis > 0 ? (totalGainLoss / totalCostBasis) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Portfolio Summary Card */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center space-x-2 text-indigo-400 text-xs font-semibold tracking-wider uppercase mb-1">
            <TrendingUp className="w-4 h-4" />
            <span>Non-Cash Assets & Investments Portfolio</span>
          </div>
          <div className="text-3xl font-extrabold text-white">
            {formatCurrency(totalPortfolioValue, baseCurrency)}
          </div>
          <div className="flex items-center space-x-3 mt-2 text-xs">
            <span className="text-slate-400">
              Total Cost Basis: {formatCurrency(totalCostBasis, baseCurrency)}
            </span>
            <span>•</span>
            <span
              className={`flex items-center space-x-0.5 font-semibold ${
                totalGainLoss >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {totalGainLoss >= 0 ? (
                <ArrowUpRight className="w-3.5 h-3.5" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5" />
              )}
              <span>
                {totalGainLoss >= 0 ? '+' : ''}
                {formatCurrency(totalGainLoss, baseCurrency)} ({totalGainLossPercent.toFixed(1)}%)
              </span>
            </span>
          </div>
        </div>

        <button
          onClick={() => {
            setAssetToEdit(null);
            setIsAssetModalOpen(true);
          }}
          className="inline-flex items-center justify-center space-x-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition shadow-lg shadow-indigo-600/20 text-sm shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Asset</span>
        </button>
      </div>

      {/* Asset Cards */}
      {assets.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/40 border border-slate-800 rounded-2xl">
          <div className="w-12 h-12 mx-auto rounded-full bg-slate-800/80 flex items-center justify-center text-slate-500 mb-3">
            <TrendingUp className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-slate-300">No investment assets recorded</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
            Track your non-cash wealth: stocks, mutual funds, cryptocurrency, physical gold, and real estate.
          </p>
          <button
            onClick={() => {
              setAssetToEdit(null);
              setIsAssetModalOpen(true);
            }}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl transition"
          >
            Add Your First Asset
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {assets.map((asset) => {
            const typeInfo = TYPE_LABELS[asset.type] || TYPE_LABELS.other;
            const gainLoss = asset.currentValue - asset.costBasis;
            const gainLossPercent = asset.costBasis > 0 ? (gainLoss / asset.costBasis) * 100 : 0;

            return (
              <div
                key={asset.id}
                className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition flex flex-col justify-between space-y-4"
              >
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">{typeInfo.icon}</span>
                    <div>
                      <div className="flex items-center space-x-1.5">
                        <h3 className="text-sm font-bold text-white">{asset.name}</h3>
                        {asset.tickerSymbol && (
                          <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono font-medium">
                            {asset.tickerSymbol}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">{typeInfo.label}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => {
                        setAssetToEdit(asset);
                        setIsAssetModalOpen(true);
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                      title="Edit Asset"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(asset)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                      title="Delete Asset"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Valuation Info */}
                <div className="space-y-1">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-slate-400">Current Valuation</span>
                    <span className="text-base font-bold text-white">
                      {formatCurrency(asset.currentValue, asset.currency)}
                    </span>
                  </div>

                  <div className="flex justify-between items-baseline text-xs text-slate-400">
                    <span>Cost Basis</span>
                    <span>{formatCurrency(asset.costBasis, asset.currency)}</span>
                  </div>

                  {asset.quantity && (
                    <div className="flex justify-between items-baseline text-[11px] text-slate-500">
                      <span>Units / Quantity</span>
                      <span>{asset.quantity}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-baseline text-xs pt-1 border-t border-slate-800/80">
                    <span>Unrealized P&L</span>
                    <span
                      className={`font-semibold flex items-center space-x-0.5 ${
                        gainLoss >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      <span>
                        {gainLoss >= 0 ? '+' : ''}
                        {formatCurrency(gainLoss, asset.currency)} ({gainLossPercent.toFixed(1)}%)
                      </span>
                    </span>
                  </div>
                </div>

                {/* Footer: Last Updated & Update Button */}
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 flex items-center space-x-1">
                    <Calendar className="w-3 h-3" />
                    <span>Valued: {asset.lastValuationDate}</span>
                  </span>

                  <button
                    onClick={() => {
                      setSelectedAssetForValuation(asset);
                      setIsValuationModalOpen(true);
                    }}
                    className="px-2.5 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 rounded-lg text-xs font-medium transition flex items-center space-x-1"
                  >
                    <span>Update Value</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Asset Modal */}
      <AssetModal
        isOpen={isAssetModalOpen}
        onClose={() => setIsAssetModalOpen(false)}
        onSaved={loadAssets}
        baseCurrency={baseCurrency}
        assetToEdit={assetToEdit}
      />

      {/* Valuation Modal */}
      <ValuationModal
        isOpen={isValuationModalOpen}
        onClose={() => setIsValuationModalOpen(false)}
        onSaved={loadAssets}
        asset={selectedAssetForValuation}
      />
    </div>
  );
};
