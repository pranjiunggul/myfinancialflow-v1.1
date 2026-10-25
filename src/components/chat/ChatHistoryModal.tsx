import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  MessageSquare,
  Calendar,
  Trash2,
  Plus,
  Lock,
  ArrowRight,
} from 'lucide-react';
import {
  listChatSessions,
  searchChatHistory,
  deleteChatSession,
} from '../../services/chatHistory';
import type { AIChatSession } from '../../types';

interface ChatHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  masterPin?: string;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
}

export const ChatHistoryModal: React.FC<ChatHistoryModalProps> = ({
  isOpen,
  onClose,
  masterPin = '000000',
  onSelectSession,
  onNewChat,
}) => {
  const [sessions, setSessions] = useState<AIChatSession[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const loadSessions = async () => {
    setIsLoading(true);
    try {
      if (searchQuery.trim() || startDate || endDate) {
        const results = await searchChatHistory(searchQuery, startDate, endDate, masterPin);
        setSessions(results.map((r) => r.session));
      } else {
        const all = await listChatSessions();
        setSessions(all);
      }
    } catch (err) {
      console.error('Failed to load chat sessions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSessions();
    }
  }, [isOpen, searchQuery, startDate, endDate]);

  if (!isOpen) return null;

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteChatSession(id);
    await loadSessions();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Encrypted Chat History</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold flex items-center gap-1">
                  <Lock className="w-3 h-3" /> AES-256
                </span>
              </h2>
              <p className="text-xs text-gray-400">
                Search past advice, queries, and action proposals
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Date Filters */}
        <div className="p-4 border-b border-gray-800 bg-gray-950/40 space-y-2.5">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-gray-500" />
            <input
              type="text"
              placeholder="Search past conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Calendar className="w-3.5 h-3.5 text-gray-500" />
            <span>From:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
            />
            <span>To:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
            />
          </div>
        </div>

        {/* Sessions List */}
        <div className="p-4 overflow-y-auto space-y-2 flex-1">
          <button
            onClick={() => {
              onNewChat();
              onClose();
            }}
            className="w-full p-3 rounded-xl border border-dashed border-indigo-500/40 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-300 flex items-center justify-center gap-2 text-xs font-semibold transition"
          >
            <Plus className="w-4 h-4" />
            <span>Start Fresh Conversation</span>
          </button>

          {isLoading ? (
            <div className="text-center py-8 text-xs text-gray-400">Loading encrypted conversations...</div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8 text-xs text-gray-400">
              No conversations found matching your filter.
            </div>
          ) : (
            sessions.map((sess) => (
              <div
                key={sess.id}
                onClick={() => {
                  onSelectSession(sess.id);
                  onClose();
                }}
                className="p-3 rounded-xl bg-gray-800/60 hover:bg-gray-800 border border-gray-700/60 hover:border-indigo-500/50 cursor-pointer flex items-center justify-between transition group"
              >
                <div className="flex-1 pr-2">
                  <h4 className="text-xs font-semibold text-white group-hover:text-indigo-300 transition truncate">
                    {sess.title}
                  </h4>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {new Date(sess.updatedAt).toLocaleDateString()} • {sess.messageCount} messages
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={(e) => handleDelete(e, sess.id)}
                    className="p-1.5 text-gray-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition"
                    title="Delete conversation"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <ArrowRight className="w-4 h-4 text-gray-500 group-hover:text-indigo-400 transition" />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
