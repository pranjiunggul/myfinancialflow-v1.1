import React, { useState } from 'react';
import { X, Shield, Fingerprint, CheckCircle, AlertCircle } from 'lucide-react';
import type { AppSettings } from '../../types';
import { createCanaryToken } from '../../services/crypto';
import { db } from '../../db/database';

interface SecuritySetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings | null;
}

export const SecuritySetupModal: React.FC<SecuritySetupModalProps> = ({
  isOpen,
  onClose,
  settings,
}) => {
  const [pinEnabled, setPinEnabled] = useState(settings?.pinEnabled || false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [biometricsEnabled, setBiometricsEnabled] = useState(settings?.biometricsEnabled || false);
  const [autoLockMinutes, setAutoLockMinutes] = useState(settings?.autoLockMinutes || 0);

  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSaveSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setStatusMessage('');

    if (pinEnabled) {
      if (newPin.length < 4 || newPin.length > 6) {
        setErrorMessage('PIN must be 4 to 6 digits.');
        return;
      }
      if (newPin !== confirmPin) {
        setErrorMessage('PIN confirmation does not match.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      let pinCanaryToken: string | undefined = undefined;

      if (pinEnabled && newPin) {
        // Derive AES-GCM-256 key via PBKDF2 (600k rounds) and create verification canary
        pinCanaryToken = await createCanaryToken(newPin);
      }

      await db.settings.update('current', {
        pinEnabled,
        pinHash: pinCanaryToken || settings?.pinHash,
        biometricsEnabled,
        autoLockMinutes,
      });

      setStatusMessage('Security settings updated successfully!');
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update security settings');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">App Lock & Encryption</h2>
              <p className="text-xs text-slate-400">Hardware & PIN security setup</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSaveSecurity} className="p-6 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center space-x-2 text-rose-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {statusMessage && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center space-x-2 text-emerald-400 text-xs">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* PIN Lock Toggle */}
          <div className="flex items-center justify-between p-3 bg-slate-950 rounded-2xl border border-slate-800">
            <div>
              <span className="text-sm font-bold text-white block">Enable Security PIN</span>
              <span className="text-xs text-slate-400">Locks ledger with PBKDF2 AES-256 derivation</span>
            </div>
            <input
              type="checkbox"
              checked={pinEnabled}
              onChange={(e) => setPinEnabled(e.target.checked)}
              className="w-5 h-5 accent-blue-600 rounded cursor-pointer"
            />
          </div>

          {pinEnabled && (
            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  New PIN (4-6 digits)
                </label>
                <input
                  type="password"
                  maxLength={6}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono text-center tracking-widest text-lg font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required={pinEnabled && !settings?.pinHash}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Confirm PIN
                </label>
                <input
                  type="password"
                  maxLength={6}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono text-center tracking-widest text-lg font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required={pinEnabled && !settings?.pinHash}
                />
              </div>

              {/* Biometrics Toggle */}
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center space-x-2">
                  <Fingerprint className="w-4 h-4 text-slate-400" />
                  <span className="text-xs text-slate-300">Allow WebAuthn Biometric Unlock</span>
                </div>
                <input
                  type="checkbox"
                  checked={biometricsEnabled}
                  onChange={(e) => setBiometricsEnabled(e.target.checked)}
                  className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                />
              </div>

              {/* Auto Lock Timeout */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                <span className="text-xs text-slate-400">Auto-lock on background</span>
                <select
                  value={autoLockMinutes}
                  onChange={(e) => setAutoLockMinutes(parseInt(e.target.value) || 0)}
                  className="px-2.5 py-1 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white"
                >
                  <option value={0}>Immediately on background</option>
                  <option value={1}>After 1 minute</option>
                  <option value={5}>After 5 minutes</option>
                  <option value={15}>After 15 minutes</option>
                </select>
              </div>
            </div>
          )}

          {/* Action */}
          <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-400 hover:text-white rounded-xl text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition shadow-md shadow-blue-600/30 disabled:opacity-50"
            >
              Save Security
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
