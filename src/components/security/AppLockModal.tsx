import React, { useState, useEffect } from 'react';
import { Lock, Fingerprint, Delete, ShieldAlert } from 'lucide-react';
import { verifyPinWithCanary } from '../../services/crypto';

interface AppLockModalProps {
  isLocked: boolean;
  pinCanary?: string;
  biometricsEnabled: boolean;
  onUnlock: (pin: string) => void;
}

export const AppLockModal: React.FC<AppLockModalProps> = ({
  isLocked,
  pinCanary,
  biometricsEnabled,
  onUnlock,
}) => {
  const [pin, setPin] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    if (isLocked) {
      setPin('');
      setErrorMessage('');
    }
  }, [isLocked]);

  if (!isLocked) return null;

  const handleDigit = (digit: string) => {
    if (pin.length < 6) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setErrorMessage('');
      if (nextPin.length >= 4 && pinCanary) {
        checkPin(nextPin);
      }
    }
  };

  const handleDelete = () => {
    setPin(pin.slice(0, -1));
    setErrorMessage('');
  };

  const handleClear = () => {
    setPin('');
    setErrorMessage('');
  };

  const checkPin = async (candidatePin: string) => {
    if (!pinCanary) {
      onUnlock(candidatePin);
      return;
    }

    setIsVerifying(true);
    try {
      const valid = await verifyPinWithCanary(pinCanary, candidatePin);
      if (valid) {
        onUnlock(candidatePin);
      } else if (candidatePin.length >= 6) {
        setErrorMessage('Incorrect PIN. Please try again.');
        setPin('');
      }
    } catch {
      setErrorMessage('Verification error');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleBiometricUnlock = async () => {
    if (!window.PublicKeyCredential) {
      setErrorMessage('Biometrics not supported on this browser.');
      return;
    }

    try {
      // Prompt user verification
      const credential = await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          userVerification: 'preferred',
          timeout: 60000,
        },
      });

      if (credential) {
        // Unlock granted via biometric authentication
        onUnlock('biometric_verified');
      }
    } catch {
      setErrorMessage('Biometric verification cancelled or unavailable.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-2xl animate-fade-in">
      <div className="w-full max-w-sm flex flex-col items-center space-y-6 text-center">
        {/* App Lock Icon */}
        <div className="w-16 h-16 rounded-3xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shadow-2xl shadow-blue-500/20">
          <Lock className="w-8 h-8" />
        </div>

        <div>
          <h2 className="text-xl font-black text-white tracking-tight">MyFinancialFlow Locked</h2>
          <p className="text-xs text-slate-400 mt-1">Enter your security PIN to access your financial ledger</p>
        </div>

        {/* PIN Dots */}
        <div className="flex items-center space-x-3 py-2">
          {[0, 1, 2, 3, 4, 5].map((idx) => (
            <div
              key={idx}
              className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                pin.length > idx
                  ? 'border-blue-500 bg-blue-500 shadow-lg shadow-blue-500/50 scale-110'
                  : 'border-slate-700 bg-slate-900'
              }`}
            />
          ))}
        </div>

        {errorMessage && (
          <div className="text-xs text-rose-400 flex items-center space-x-1.5 animate-shake">
            <ShieldAlert className="w-4 h-4" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              onClick={() => handleDigit(d)}
              disabled={isVerifying}
              className="h-14 rounded-2xl bg-slate-900/80 hover:bg-slate-800 text-white font-mono text-xl font-bold border border-slate-800/80 shadow-md active:scale-95 transition"
            >
              {d}
            </button>
          ))}

          {/* Biometric / Clear Button */}
          {biometricsEnabled ? (
            <button
              onClick={handleBiometricUnlock}
              className="h-14 rounded-2xl bg-slate-900/40 hover:bg-slate-800 text-blue-400 flex items-center justify-center border border-slate-800/60 transition"
              title="Biometric Unlock"
            >
              <Fingerprint className="w-6 h-6" />
            </button>
          ) : (
            <button
              onClick={handleClear}
              className="h-14 rounded-2xl bg-slate-900/40 hover:bg-slate-800 text-slate-400 text-xs font-semibold border border-slate-800/60 transition uppercase"
            >
              Clear
            </button>
          )}

          <button
            onClick={() => handleDigit('0')}
            disabled={isVerifying}
            className="h-14 rounded-2xl bg-slate-900/80 hover:bg-slate-800 text-white font-mono text-xl font-bold border border-slate-800/80 shadow-md active:scale-95 transition"
          >
            0
          </button>

          <button
            onClick={handleDelete}
            className="h-14 rounded-2xl bg-slate-900/40 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center border border-slate-800/60 transition active:scale-95"
            title="Backspace"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
