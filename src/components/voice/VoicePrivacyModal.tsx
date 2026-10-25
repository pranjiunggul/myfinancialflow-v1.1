import React from 'react';
import { X, Mic, ShieldAlert, Check } from 'lucide-react';
import { setVoiceInputStatus } from '../../services/voiceInput';

interface VoicePrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAcknowledged: () => void;
}

export const VoicePrivacyModal: React.FC<VoicePrivacyModalProps> = ({
  isOpen,
  onClose,
  onAcknowledged,
}) => {
  if (!isOpen) return null;

  const handleEnable = async () => {
    await setVoiceInputStatus(true);
    onAcknowledged();
    onClose();
  };

  const handleDecline = async () => {
    await setVoiceInputStatus(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400">
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Voice Input Privacy Notice</h2>
              <p className="text-xs text-slate-400">Browser cloud speech disclosure</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs text-slate-300 leading-relaxed">
          <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start space-x-2.5 text-amber-300">
            <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
            <span>
              <strong>Privacy Notice:</strong> Unlike the rest of MyFinancialFlow, which operates 100% offline and zero-knowledge, your browser's Web Speech API may transmit audio to your browser vendor's servers (e.g. Google's servers in Chrome, Apple's servers in Safari) for transcription.
            </span>
          </div>

          <p>
            No personal financial ledger data, transaction balances, or account details are ever transmitted—only the spoken audio snippet during active listening.
          </p>

          <p className="text-slate-400">
            The transcribed text is then parsed directly on your device using MyFinancialFlow's local offline NLU engine.
          </p>

          <p className="text-slate-400">
            You can disable voice input at any time in <strong>Settings → Privacy & Preferences</strong>.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end space-x-3 px-6 py-4 bg-slate-950/60 border-t border-slate-800">
          <button
            type="button"
            onClick={handleDecline}
            className="px-4 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 text-xs font-semibold transition"
          >
            Keep Disabled
          </button>
          <button
            type="button"
            onClick={handleEnable}
            className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition shadow-lg shadow-purple-600/20 flex items-center space-x-1.5"
          >
            <Check className="w-4 h-4" />
            <span>I Understand & Enable Voice</span>
          </button>
        </div>
      </div>
    </div>
  );
};
