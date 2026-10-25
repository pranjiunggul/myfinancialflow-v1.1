/**
 * Cryptographic Security Engine for FinanceFlow
 * Uses Web Crypto API (SubtleCrypto) for AES-GCM-256 authenticated encryption
 * and PBKDF2 key derivation with 600,000 iterations.
 */

export interface EncryptedPayload {
  format: 'financeflow_enc_v1';
  salt: string;       // Hex encoded 16-byte salt
  iv: string;         // Hex encoded 12-byte IV
  ciphertext: string; // Base64 encoded ciphertext + auth tag
  timestamp: number;
}

// Helper: Convert ArrayBuffer to Hex string
function buf2hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}

// Helper: Convert Hex string to Uint8Array
function hex2buf(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

// Helper: Convert ArrayBuffer to Base64
function buf2base64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Helper: Convert Base64 to Uint8Array
function base642buf(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Derive an AES-GCM-256 CryptoKey from a user PIN/passphrase using PBKDF2 (600k rounds)
 */
export async function deriveKeyFromPin(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 600000, // NIST recommended round count for SHA-256
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt arbitrary plain text or JSON object using AES-GCM-256
 */
export async function encryptData(data: any, pin: string): Promise<EncryptedPayload> {
  const jsonString = typeof data === 'string' ? data : JSON.stringify(data);
  const enc = new TextEncoder();
  const plainBytes = enc.encode(jsonString);

  // Generate random 16-byte salt and 12-byte IV
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const key = await deriveKeyFromPin(pin, salt);

  const cipherBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource,
    },
    key,
    plainBytes
  );

  return {
    format: 'financeflow_enc_v1',
    salt: buf2hex(salt.buffer as ArrayBuffer),
    iv: buf2hex(iv.buffer as ArrayBuffer),
    ciphertext: buf2base64(cipherBuffer),
    timestamp: Date.now(),
  };
}

/**
 * Decrypt an EncryptedPayload back into parsed data using the user PIN
 */
export async function decryptData<T = any>(payload: EncryptedPayload, pin: string): Promise<T> {
  if (payload.format !== 'financeflow_enc_v1') {
    throw new Error('Unsupported encrypted payload format');
  }

  const salt = hex2buf(payload.salt);
  const iv = hex2buf(payload.iv);
  const cipherBytes = base642buf(payload.ciphertext);

  const key = await deriveKeyFromPin(pin, salt);

  try {
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv as BufferSource,
      },
      key,
      cipherBytes as BufferSource
    );

    const dec = new TextDecoder();
    const rawString = dec.decode(decryptedBuffer);
    try {
      return JSON.parse(rawString) as T;
    } catch {
      return rawString as unknown as T;
    }
  } catch {
    throw new Error('Decryption failed: Incorrect PIN/passphrase or corrupted data.');
  }
}

/**
 * Create a verifiable canary token for checking if a PIN is correct during app unlock
 */
export async function createCanaryToken(pin: string): Promise<string> {
  const payload = await encryptData({ canary: 'financeflow_valid_session' }, pin);
  return JSON.stringify(payload);
}

/**
 * Validate PIN against canary token
 */
export async function verifyPinWithCanary(canaryJson: string, pin: string): Promise<boolean> {
  try {
    const payload: EncryptedPayload = JSON.parse(canaryJson);
    const data = await decryptData<{ canary: string }>(payload, pin);
    return data.canary === 'financeflow_valid_session';
  } catch {
    return false;
  }
}

/**
 * Compute standard SHA-256 hex digest for arbitrary string data (tamper-evidence)
 */
export async function computeSha256Hex(data: string): Promise<string> {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(data));
  return buf2hex(digest);
}

/**
 * Compute HMAC-SHA-256 hex signature using a secret (e.g. Master PIN)
 */
export async function computeHmacSha256(data: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret || 'myfinancialflow_tamper_seal_key'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return buf2hex(signature);
}

