/**
 * Voice Input Service for Transaction Logging
 * Uses browser native Web Speech API (SpeechRecognition / webkitSpeechRecognition).
 * Strictly gated behind an opt-in privacy disclosure regarding cloud speech processing.
 */

import { db } from '../db/database';

export interface SpeechRecognitionResultEvent {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
        confidence: number;
      };
      isFinal: boolean;
    };
    length: number;
  };
}

/**
 * Checks whether the browser platform supports SpeechRecognition
 */
export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
}

/**
 * Checks whether the user has acknowledged the cloud speech privacy disclosure
 */
export async function isVoiceInputAcknowledged(): Promise<boolean> {
  const settings = await db.settings.get('app_settings');
  return !!settings?.voiceInputAcknowledged && !!settings?.voiceInputEnabled;
}

/**
 * Persists acknowledgment and enables voice input
 */
export async function setVoiceInputStatus(enabled: boolean): Promise<void> {
  const current = await db.settings.get('app_settings');
  if (current) {
    await db.settings.put({
      ...current,
      voiceInputAcknowledged: true,
      voiceInputEnabled: enabled,
    });
  }
}

let activeRecognitionInstance: any = null;

/**
 * Starts speech recognition listening session
 */
export function startVoiceListening(callbacks: {
  onResult: (transcript: string, isFinal: boolean) => void;
  onError: (errorMessage: string) => void;
  onEnd: () => void;
  lang?: string;
}): (() => void) {
  if (!isSpeechRecognitionSupported()) {
    callbacks.onError('Web Speech API is not supported on this browser.');
    return () => {};
  }

  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  try {
    if (activeRecognitionInstance) {
      try {
        activeRecognitionInstance.abort();
      } catch {}
    }

    const recognition = new SpeechRecognition();
    activeRecognitionInstance = recognition;

    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = callbacks.lang || 'id-ID'; // Default to Indonesian with English fallback

    recognition.onresult = (event: SpeechRecognitionResultEvent) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = 0; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      callbacks.onResult(finalTranscript || interimTranscript, !!finalTranscript);
    };

    recognition.onerror = (event: any) => {
      console.warn('[VoiceInput] Speech recognition error event:', event.error);
      callbacks.onError(event.error || 'Speech recognition failed.');
    };

    recognition.onend = () => {
      activeRecognitionInstance = null;
      callbacks.onEnd();
    };

    recognition.start();

    // Return stop callback
    return () => {
      try {
        recognition.stop();
      } catch {}
    };
  } catch (err: any) {
    callbacks.onError(err?.message || 'Failed to start speech recognition.');
    return () => {};
  }
}
