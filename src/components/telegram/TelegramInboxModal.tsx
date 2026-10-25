import React, { useState, useEffect } from 'react';
import {
  X,
  Send,
  Check,
  Trash2,
  Receipt,
  MessageSquare,
  Sparkles,
  ShieldCheck,
  RefreshCw,
  HelpCircle,
  CheckCheck,
  Calendar,
  Wallet,
  Tag,
  Plus,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import {
  parseTelegramItemToProposal,
  confirmTelegramItem,
  rejectTelegramItem,
  confirmAllTelegramItems,
} from '../../services/telegram';
import { QuickAddCategoryModal } from '../shared/QuickAddCategoryModal';
import { QuickAddAccountModal } from '../shared/QuickAddAccountModal';
import type { TelegramInboxItem, Account, Category, CurrencyCode } from '../../types';

interface TelegramInboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: Account[];
  categories: Category[];
  baseCurrency: CurrencyCode;
}

export const TelegramInboxModal: React.FC<TelegramInboxModalProps> = ({
  isOpen,
  onClose,
  accounts,
  categories,
  baseCurrency,
}) => {
  const [activeTab, setActiveTab] = useState<'inbox' | 'setup'>('inbox');
  const [parsingMap, setParsingMap] = useState<Record<string, boolean>>({});
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [quickAddType, setQuickAddType] = useState<'category' | 'account' | null>(null);
  const [targetItemId, setTargetItemId] = useState<string | null>(null);

  // Live query for telegram inbox items
  const items = useLiveQuery(() => db.telegram_inbox.toArray(), []) || [];
  const pendingItems = items.filter((i) => i.status === 'pending');

  const handleUpdateCategory = async (itemId: string, newCategoryId: string) => {
    if (newCategoryId === '__new_category__') {
      setTargetItemId(itemId);
      setQuickAddType('category');
      return;
    }
    const item = pendingItems.find((i) => i.id === itemId);
    if (!item || !item.processedProposal) return;
    const cat = categories.find((c) => c.id === newCategoryId);
    if (!cat) return;
    const updatedProposal = {
      ...item.processedProposal,
      data: {
        ...item.processedProposal.data,
        categoryId: cat.id,
        categoryName: cat.name,
      },
    };
    await db.telegram_inbox.update(itemId, {
      processedProposal: updatedProposal,
    });
  };

  const handleUpdateAccount = async (itemId: string, newAccountId: string) => {
    if (newAccountId === '__new_account__') {
      setTargetItemId(itemId);
      setQuickAddType('account');
      return;
    }
    const item = pendingItems.find((i) => i.id === itemId);
    if (!item || !item.processedProposal) return;
    const acc = accounts.find((a) => a.id === newAccountId);
    if (!acc) return;
    const updatedProposal = {
      ...item.processedProposal,
      data: {
        ...item.processedProposal.data,
        accountId: acc.id,
        accountName: acc.name,
      },
    };
    await db.telegram_inbox.update(itemId, {
      processedProposal: updatedProposal,
    });
  };

  // Automatically parse any new pending items that lack a proposal
  useEffect(() => {
    if (!isOpen) return;

    async function autoParse() {
      for (const item of pendingItems) {
        if (!item.processedProposal && !parsingMap[item.id]) {
          setParsingMap((prev) => ({ ...prev, [item.id]: true }));
          try {
            await parseTelegramItemToProposal(item, accounts, categories, baseCurrency);
          } finally {
            setParsingMap((prev) => ({ ...prev, [item.id]: false }));
          }
        }
      }
    }
    autoParse();
  }, [isOpen, pendingItems.length]);

  if (!isOpen) return null;

  const handleConfirmItem = async (item: TelegramInboxItem) => {
    try {
      await confirmTelegramItem(item, { accounts, categories, baseCurrency });
    } catch (err: any) {
      alert(`Error confirming transaction: ${err.message}`);
    }
  };

  const handleRejectItem = async (id: string) => {
    await rejectTelegramItem(id);
  };

  const handleConfirmAll = async () => {
    setIsProcessingAll(true);
    try {
      await confirmAllTelegramItems(pendingItems, { accounts, categories, baseCurrency });
    } finally {
      setIsProcessingAll(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/20">
              <Send className="w-5 h-5 -rotate-12 translate-x-0.5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-extrabold text-base text-white tracking-tight">Telegram Inbound Inbox</h3>
                <span className="px-2 py-0.5 text-[10px] font-black rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  {pendingItems.length} PENDING
                </span>
              </div>
              <p className="text-xs text-slate-400">Zero-Knowledge Review Tray & Local AI Ingestion</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveTab(activeTab === 'inbox' ? 'setup' : 'inbox')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 border ${
                activeTab === 'setup'
                  ? 'bg-blue-600 text-white border-blue-500'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>{activeTab === 'setup' ? 'View Inbox' : 'Bot Setup'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === 'setup' ? (
            <div className="space-y-5 text-sm">
              <div className="p-4 rounded-xl bg-blue-950/30 border border-blue-800/40 space-y-2">
                <div className="flex items-center space-x-2 text-blue-400 font-bold text-xs uppercase tracking-wider">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Zero-Knowledge Privacy Principle</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  MyFinancialFlow never runs OCR or AI parsing on third-party servers. Your AI keys never leave your device.
                  Telegram relays purely pass raw text/photos into your encrypted inbox, where your local browser parses them.
                </p>
              </div>

              {/* Option B: Local Daemon */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-white flex items-center space-x-2">
                    <span className="w-6 h-6 rounded-md bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-black">B</span>
                    <span>Option B: Local Long-Polling Daemon (Recommended)</span>
                  </h4>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    NO TUNNEL NEEDED
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Requires zero public HTTPS endpoints. Simply create a bot with @BotFather and run the daemon script on your PC:
                </p>
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 font-mono text-xs text-indigo-300 overflow-x-auto">
                  npx tsx scripts/telegram-daemon.ts --token YOUR_TELEGRAM_BOT_TOKEN
                </div>
              </div>

              {/* Option A: Cloudflare Worker */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-white flex items-center space-x-2">
                    <span className="w-6 h-6 rounded-md bg-sky-500/20 text-sky-400 flex items-center justify-center text-xs font-black">A</span>
                    <span>Option A: Cloudflare Worker Serverless Relay</span>
                  </h4>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
                    24/7 CLOUD RELAY
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Deploy the lightweight dumb relay located at <code className="text-blue-300">worker/telegram-relay.ts</code> to Cloudflare Workers. It relays updates to your private Google Drive inbox without holding any API keys.
                </p>
              </div>
            </div>
          ) : pendingItems.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-slate-800/60 flex items-center justify-center mx-auto text-slate-500">
                <Send className="w-7 h-7" />
              </div>
              <h4 className="font-bold text-white text-base">Inbox is Empty</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                No pending receipts or messages from Telegram. Send a photo receipt or text like "kopi 35k bca" to your bot to see it appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Pending Review ({pendingItems.length})
                </span>
                <button
                  onClick={handleConfirmAll}
                  disabled={isProcessingAll}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-lg shadow-emerald-600/20 transition"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>{isProcessingAll ? 'Confirming...' : 'Confirm All'}</span>
                </button>
              </div>

              {pendingItems.map((item) => {
                const prop = item.processedProposal;
                const isParsing = parsingMap[item.id];

                return (
                  <div
                    key={item.id}
                    className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-slate-700/80 transition space-y-3"
                  >
                    {/* Item Meta */}
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-2">
                        {item.type === 'photo' ? (
                          <span className="flex items-center space-x-1 px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-bold">
                            <Receipt className="w-3 h-3" />
                            <span>Photo Receipt</span>
                          </span>
                        ) : (
                          <span className="flex items-center space-x-1 px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-bold">
                            <MessageSquare className="w-3 h-3" />
                            <span>Text Message</span>
                          </span>
                        )}
                        <span className="text-slate-400 font-medium">from {item.fromName}</span>
                      </div>
                      <span className="text-slate-500 font-mono text-[11px]">
                        {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {/* Raw Text / Photo Preview */}
                    <div className="space-y-2">
                      {item.rawText && (
                        <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/60 font-mono text-xs text-slate-200">
                          "{item.rawText}"
                        </div>
                      )}
                      {item.photoBase64 && (
                        <div className="relative rounded-lg overflow-hidden border border-slate-800 max-h-40 w-fit">
                          <img
                            src={item.photoBase64}
                            alt="Receipt Preview"
                            className="object-contain max-h-40 rounded"
                          />
                        </div>
                      )}
                    </div>

                    {/* Parsed Proposal Card */}
                    {isParsing ? (
                      <div className="p-3 rounded-lg bg-blue-950/20 border border-blue-900/30 flex items-center space-x-2 text-xs text-blue-400 animate-pulse">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Parsing details client-side...</span>
                      </div>
                    ) : prop ? (
                      <div className="p-3 rounded-xl bg-slate-900/90 border border-blue-500/30 space-y-2.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-extrabold text-white flex items-center space-x-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                            <span>Proposed Transaction:</span>
                          </span>
                          <span className="font-mono font-bold text-emerald-400 text-sm">
                            {prop.data.amount?.toLocaleString()} {prop.data.currency || baseCurrency}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                          {/* Category Selector with Quick Add */}
                          <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800 flex flex-col justify-between">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-slate-500 uppercase font-bold flex items-center space-x-1">
                                <Tag className="w-3 h-3 text-slate-400" />
                                <span>Category</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setTargetItemId(item.id);
                                  setQuickAddType('category');
                                }}
                                className="text-[10px] text-sky-400 hover:text-sky-300 font-bold flex items-center space-x-0.5"
                              >
                                <Plus className="w-2.5 h-2.5" />
                                <span>Add</span>
                              </button>
                            </div>
                            <select
                              value={prop.data.categoryId || ''}
                              onChange={(e) => handleUpdateCategory(item.id, e.target.value)}
                              className="bg-slate-900 text-slate-200 text-xs px-2 py-1 rounded border border-slate-700/80 mt-1 w-full truncate focus:outline-none focus:ring-1 focus:ring-sky-500"
                            >
                              {categories.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                              <option value="__new_category__">+ Add new category...</option>
                            </select>
                          </div>

                          {/* Account Selector with Quick Add */}
                          <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800 flex flex-col justify-between">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-slate-500 uppercase font-bold flex items-center space-x-1">
                                <Wallet className="w-3 h-3 text-slate-400" />
                                <span>Account</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setTargetItemId(item.id);
                                  setQuickAddType('account');
                                }}
                                className="text-[10px] text-sky-400 hover:text-sky-300 font-bold flex items-center space-x-0.5"
                              >
                                <Plus className="w-2.5 h-2.5" />
                                <span>Add</span>
                              </button>
                            </div>
                            <select
                              value={prop.data.accountId || ''}
                              onChange={(e) => handleUpdateAccount(item.id, e.target.value)}
                              className="bg-slate-900 text-slate-200 text-xs px-2 py-1 rounded border border-slate-700/80 mt-1 w-full truncate focus:outline-none focus:ring-1 focus:ring-sky-500"
                            >
                              {accounts.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name} ({a.currency})
                                </option>
                              ))}
                              <option value="__new_account__">+ Add new account...</option>
                            </select>
                          </div>

                          {/* Date */}
                          <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800 flex flex-col justify-between">
                            <span className="text-[10px] text-slate-500 uppercase font-bold flex items-center space-x-1">
                              <Calendar className="w-3 h-3 text-slate-400" />
                              <span>Date</span>
                            </span>
                            <p className="font-semibold text-slate-200 truncate mt-1">
                              {prop.data.date || new Date().toISOString().split('T')[0]}
                            </p>
                          </div>
                        </div>

                        {prop.data.description && (
                          <p className="text-xs text-slate-300 font-medium">
                            <span className="text-slate-500">Note: </span>
                            {prop.data.description}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-900/30 text-xs text-amber-400">
                        Could not auto-parse amount or category from this message.
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center justify-end space-x-2 pt-1">
                      <button
                        onClick={() => handleRejectItem(item.id)}
                        className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-red-500/20 hover:text-red-400 text-slate-400 text-xs font-bold transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Discard</span>
                      </button>

                      <button
                        onClick={() => handleConfirmItem(item)}
                        disabled={!prop}
                        className="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-blue-600/20 transition"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Confirm & Log</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Inline Quick Add Category Modal */}
      <QuickAddCategoryModal
        isOpen={quickAddType === 'category'}
        onClose={() => {
          setQuickAddType(null);
          setTargetItemId(null);
        }}
        onCreated={async (newCat: Category) => {
          if (targetItemId) {
            const itm = pendingItems.find((i) => i.id === targetItemId);
            if (itm && itm.processedProposal) {
              const updatedProposal = {
                ...itm.processedProposal,
                data: {
                  ...itm.processedProposal.data,
                  categoryId: newCat.id,
                  categoryName: newCat.name,
                },
              };
              await db.telegram_inbox.update(targetItemId, {
                processedProposal: updatedProposal,
              });
            }
          }
          setQuickAddType(null);
          setTargetItemId(null);
        }}
      />

      {/* Inline Quick Add Account Modal */}
      <QuickAddAccountModal
        isOpen={quickAddType === 'account'}
        baseCurrency={baseCurrency}
        onClose={() => {
          setQuickAddType(null);
          setTargetItemId(null);
        }}
        onCreated={async (newAcc: Account) => {
          if (targetItemId) {
            const itm = pendingItems.find((i) => i.id === targetItemId);
            if (itm && itm.processedProposal) {
              const updatedProposal = {
                ...itm.processedProposal,
                data: {
                  ...itm.processedProposal.data,
                  accountId: newAcc.id,
                  accountName: newAcc.name,
                },
              };
              await db.telegram_inbox.update(targetItemId, {
                processedProposal: updatedProposal,
              });
            }
          }
          setQuickAddType(null);
          setTargetItemId(null);
        }}
      />
    </div>
  );
};
