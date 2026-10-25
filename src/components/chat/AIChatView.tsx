import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Sparkles,
  Camera,
  Bot,
  User,
  RefreshCw,
  TrendingUp,
  Sliders,
  History,
  Mic,
} from 'lucide-react';
import type {
  Account,
  Category,
  CurrencyCode,
  ChatMessage,
  ActionProposal,
  AppSettings,
} from '../../types';
import { sendUnifiedChatMessage } from '../../services/ai';
import { saveChatSession, loadChatSessionMessages } from '../../services/chatHistory';
import {
  isSpeechRecognitionSupported,
  isVoiceInputAcknowledged,
  startVoiceListening,
} from '../../services/voiceInput';
import { ActionProposalCard } from './ActionProposalCard';
import { ReceiptScannerModal } from './ReceiptScannerModal';
import { BulkHistoryImportModal } from '../transactions/BulkHistoryImportModal';
import { ChatHistoryModal } from './ChatHistoryModal';
import { VoicePrivacyModal } from '../voice/VoicePrivacyModal';

interface AIChatViewProps {
  accounts: Account[];
  categories: Category[];
  baseCurrency: CurrencyCode;
  settings: AppSettings | null;
  masterPin?: string;
  onOpenSettings: () => void;
  onNavigateTab: (tab: string) => void;
}

const INITIAL_GREETING: ChatMessage = {
  id: 'msg_initial',
  role: 'assistant',
  content: `Hello! I'm your MyFinancialFlow Assistant. You can ask me to:
- **Log or modify transactions** ("*Makan siang 45rb cash*", "*Edit coffee yesterday to 50k*", "*Delete last taxi ride*")
- **Search transaction history** ("*How much did I spend on food this month?*", "*Show transactions above 1M*")
- **Generate reports** ("*Show October cash flow*", "*Check my budget limits*")
- **Ask financial questions** ("*How can I optimize my savings?*")
- **Scan receipt photos** via the camera button below.

How can I help you today?`,
  timestamp: Date.now(),
};

const SUGGESTION_PILLS = [
  'Kopi 35k BCA',
  'How much spent on food this month?',
  'Show October cash flow',
  'Check my budget status',
  'List all my accounts and balances',
];

export const AIChatView: React.FC<AIChatViewProps> = ({
  accounts,
  categories,
  baseCurrency,
  settings,
  masterPin,
  onOpenSettings,
  onNavigateTab,
}) => {
  const [sessionId, setSessionId] = useState<string>(() => 'sess_' + Date.now());
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_GREETING]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isBulkHistoryModalOpen, setIsBulkHistoryModalOpen] = useState(false);
  const [selectedImageFile, setSelectedImageFile] = useState<File | Blob | null>(null);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const stopListeningRef = useRef<(() => void) | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleMicClick = async () => {
    if (!isSpeechRecognitionSupported()) return;

    const isAcknowledged = await isVoiceInputAcknowledged();
    if (!isAcknowledged) {
      setIsVoiceModalOpen(true);
      return;
    }

    if (isListening) {
      if (stopListeningRef.current) stopListeningRef.current();
      setIsListening(false);
      return;
    }

    setIsListening(true);
    const stopFn = startVoiceListening({
      onResult: (transcript) => {
        setInputText(transcript);
      },
      onError: (err) => {
        console.warn('Voice recognition error:', err);
        setIsListening(false);
      },
      onEnd: () => {
        setIsListening(false);
      },
      lang: 'id-ID',
    });
    stopListeningRef.current = stopFn;
  };

  const handleSelectSession = async (id: string) => {
    setIsLoading(true);
    try {
      const loaded = await loadChatSessionMessages(id, masterPin);
      if (loaded.length > 0) {
        setMessages(loaded);
        setSessionId(id);
      }
    } catch (err) {
      console.warn('Failed to load session:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewChat = () => {
    setMessages([INITIAL_GREETING]);
    setSessionId('sess_' + Date.now());
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          setSelectedImageFile(file);
          setIsReceiptModalOpen(true);
          break;
        }
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedImageFile(file);
      setIsReceiptModalOpen(true);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isLoading) return;

    setInputText('');

    const userMessage: ChatMessage = {
      id: 'msg_' + crypto.randomUUID().slice(0, 8),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await sendUnifiedChatMessage(
        text,
        messages,
        settings,
        { accounts, categories, baseCurrency, masterPin }
      );

      const assistantMessage: ChatMessage = {
        id: 'msg_' + crypto.randomUUID().slice(0, 8),
        role: 'assistant',
        content: response.replyText,
        timestamp: Date.now(),
        proposals: response.proposals,
        chartView: response.chartView,
        servingProvider: response.servingProvider,
        servingModel: response.servingModel,
        failoverChain: response.failoverChain,
      };

      const updated = [...messages, userMessage, assistantMessage];
      setMessages(updated);

      // Feature 5: Encrypted Persistence
      const title = text.slice(0, 35);
      saveChatSession(sessionId, title, updated, masterPin).catch(console.warn);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: 'msg_err_' + Date.now(),
          role: 'assistant',
          content: `Sorry, I encountered an error: ${err.message}`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProposalGeneratedFromOCR = (proposal: ActionProposal) => {
    const ocrMessage: ChatMessage = {
      id: 'msg_ocr_' + Date.now(),
      role: 'assistant',
      content: `I scanned your receipt and extracted the transaction details. Please review the proposal below:`,
      timestamp: Date.now(),
      proposals: [proposal],
    };
    setMessages((prev) => [...prev, ocrMessage]);
  };

  const isAiConfigured = !!settings?.aiEnabled && (!!settings.aiApiKey || settings.aiProvider === 'ollama_local');

  return (
    <div
      onPaste={handlePaste}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      className="flex flex-col h-[calc(100vh-140px)] sm:h-[calc(100vh-120px)] max-w-4xl mx-auto bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl relative"
    >
      {/* Header */}
      <div className="p-4 px-6 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-500 flex items-center justify-center shadow-md shadow-indigo-600/20 text-white">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-extrabold text-white flex items-center space-x-2">
              <span>MyFinancialFlow AI Copilot</span>
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                {settings?.aiProvider || 'Offline Tier-1'}
              </span>
            </h2>
            <p className="text-[11px] text-slate-400">
              {isAiConfigured
                ? 'Grounded in your financial ledger with zero-write safety gate'
                : 'Offline quick-entry active. Add API key in Settings for full LLM.'}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsReceiptModalOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
          >
            <Camera className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Scan Receipt</span>
          </button>

          <button
            onClick={() => setIsHistoryModalOpen(true)}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Search Chat History"
          >
            <History className="w-4 h-4 text-indigo-400" />
          </button>

          <button
            onClick={onOpenSettings}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Configure AI Provider"
          >
            <Sliders className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';

          return (
            <div
              key={msg.id}
              className={`flex items-start space-x-2.5 ${isUser ? 'flex-row-reverse space-x-reverse' : ''}`}
            >
              {/* Avatar */}
              <div
                className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 text-white text-xs ${
                  isUser
                    ? 'bg-blue-600 shadow-sm shadow-blue-500/20'
                    : 'bg-indigo-600 shadow-sm shadow-indigo-500/20'
                }`}
              >
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              {/* Message Bubble */}
              <div
                className={`max-w-[85%] sm:max-w-xl rounded-2xl p-4 text-xs sm:text-sm leading-relaxed ${
                  isUser
                    ? 'bg-blue-600 text-white rounded-tr-sm'
                    : 'bg-slate-950/80 border border-slate-800 text-slate-200 rounded-tl-sm'
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>

                {/* Proposals Cards (Create / Edit / Delete Confirmation Gate) */}
                {msg.proposals && msg.proposals.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {msg.proposals.map((prop) => (
                      <ActionProposalCard
                        key={prop.id}
                        proposal={prop}
                        accounts={accounts}
                        categories={categories}
                        baseCurrency={baseCurrency}
                        onExecuted={() => {
                          setMessages((prev) => [...prev]);
                        }}
                      />
                    ))}
                  </div>
                )}

                {/* Quick Navigation / Chart trigger */}
                {msg.chartView && (
                  <div className="mt-3 pt-2 border-t border-slate-800">
                    <button
                      onClick={() => onNavigateTab('dashboard')}
                      className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/20 text-indigo-300 font-semibold text-xs hover:bg-indigo-600/30 transition"
                    >
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span>Open Full Dashboard Visualizations</span>
                    </button>
                  </div>
                )}

                {/* Serving Engine Badge */}
                {!isUser && (msg.servingProvider || msg.servingModel) ? (
                  <div className="mt-2.5 pt-1.5 border-t border-slate-800/60 flex items-center justify-between text-[10px]">
                    <div className="flex items-center space-x-1 text-slate-400 font-mono">
                      {msg.servingProvider === 'Offline Intelligence' ? (
                        <span className="flex items-center space-x-1 text-amber-400/90 font-medium bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                          <span>💾</span>
                          <span>via Offline Engine ({msg.servingModel || 'Deterministic'})</span>
                        </span>
                      ) : (
                        <span className="flex items-center space-x-1 text-indigo-300 font-medium bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">
                          <span>⚡</span>
                          <span>via {msg.servingProvider} ({msg.servingModel})</span>
                        </span>
                      )}
                      {msg.failoverChain && msg.failoverChain.length > 0 && (
                        <span
                          className="text-amber-400 cursor-pointer ml-1 text-[9px] bg-amber-500/15 px-1 py-0.5 rounded border border-amber-500/30"
                          title={`Rolled over from: ${msg.failoverChain.map((f) => `${f.provider} (${f.reason})`).join(' → ')}`}
                        >
                          ⚠️ rollover
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ) : (
                  <div
                    className={`mt-1.5 text-[10px] text-right font-mono ${
                      isUser ? 'text-blue-200/70' : 'text-slate-500'
                    }`}
                  >
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex items-center space-x-2 text-indigo-400 text-xs p-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Analyzing ledger and executing financial tools...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggestion Pills */}
      <div className="p-2.5 px-4 bg-slate-950/40 border-t border-slate-800/60 overflow-x-auto flex items-center space-x-2 no-scrollbar">
        {SUGGESTION_PILLS.map((pill) => (
          <button
            key={pill}
            onClick={() => handleSendMessage(pill)}
            className="px-3 py-1 rounded-full bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-slate-300 text-xs font-medium whitespace-nowrap transition"
          >
            {pill}
          </button>
        ))}
      </div>

      {/* Input Box */}
      <div className="p-3 sm:p-4 bg-slate-950 border-t border-slate-800 flex items-center space-x-2">
        <button
          onClick={() => setIsReceiptModalOpen(true)}
          className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white transition"
          title="Scan Receipt with Camera"
        >
          <Camera className="w-5 h-5 text-indigo-400" />
        </button>

        {isSpeechRecognitionSupported() && (
          <button
            type="button"
            onClick={handleMicClick}
            className={`p-2.5 rounded-xl border transition ${
              isListening
                ? 'bg-rose-500/20 border-rose-500 text-rose-400 animate-pulse'
                : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white'
            }`}
            title={isListening ? 'Listening... click to stop' : 'Voice Input (Indonesian/English)'}
          >
            {isListening ? <Mic className="w-5 h-5 text-rose-400" /> : <Mic className="w-5 h-5 text-purple-400" />}
          </button>
        )}

        <input
          type="text"
          placeholder="Ask anything or log e.g. 'Makan siang 45rb cash'..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSendMessage();
          }}
          disabled={isLoading}
          className="flex-1 px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-2xl text-white text-xs sm:text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        <button
          onClick={() => handleSendMessage()}
          disabled={!inputText.trim() || isLoading}
          className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition shadow-lg shadow-indigo-600/30 disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>

      {/* Receipt & Bank Slip Scanner Modal */}
      <ReceiptScannerModal
        isOpen={isReceiptModalOpen}
        onClose={() => {
          setIsReceiptModalOpen(false);
          setSelectedImageFile(null);
        }}
        accounts={accounts}
        categories={categories}
        baseCurrency={baseCurrency}
        settings={settings}
        masterPin={masterPin}
        initialFile={selectedImageFile}
        onProposalGenerated={handleProposalGeneratedFromOCR}
        onSwitchToBulkHistory={() => setIsBulkHistoryModalOpen(true)}
      />

      {/* Bulk History Multi-Row Screenshot Modal */}
      <BulkHistoryImportModal
        isOpen={isBulkHistoryModalOpen}
        onClose={() => setIsBulkHistoryModalOpen(false)}
        accounts={accounts}
        categories={categories}
        baseCurrency={baseCurrency}
        settings={settings}
        masterPin={masterPin}
        onSuccess={(count) => {
          const successMsg: ChatMessage = {
            id: 'msg_imported_' + Date.now(),
            role: 'assistant',
            content: `✅ Berhasil mengimpor **${count} transaksi** dari screenshot riwayat mutasi langsung ke buku kas Anda.`,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, successMsg]);
        }}
      />

      {/* Feature 5: Searchable Encrypted Chat History Modal */}
      <ChatHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        masterPin={masterPin}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
      />

      {/* Feature 4: Privacy-Preserving Voice Input Modal */}
      <VoicePrivacyModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        onAcknowledged={() => {
          setIsVoiceModalOpen(false);
          handleMicClick();
        }}
      />
    </div>
  );
};
