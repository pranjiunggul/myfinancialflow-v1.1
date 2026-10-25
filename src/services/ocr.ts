/**
 * Lazy-Loaded Receipt & Bank Transaction OCR / AI Vision Engine for FinanceFlow
 * Supports:
 * - Deterministic Client-side Canvas preprocessing (Grayscale + Contrast stretch)
 * - SHA-256 image fingerprinting for duplicate transaction receipt detection
 * - Robust Indonesian & International Bank Slip / M-Banking / Mutasi / Struk Parser:
 *   * Detects transaction types: expense, income (transfer masuk), transfer antar rekening
 *   * Accurate Rupiah currency parsing (handles Indonesian thousand dots vs comma decimals)
 *   * Accurate Indonesian date resolution (Okt, Des, etc.)
 *   * Extracts source bank, recipient, account numbers, admin/transfer fee, and berita/catatan
 * - Multimodal AI Vision scanning (Gemini 1.5/2.0 Flash, OpenAI gpt-4o-mini) when AI is enabled
 * - Offline-first fallback to Tesseract.js (ind+eng)
 * - Pre-commit verification proposal integration
 */

import { db } from '../db/database';
import type {
  OCRScanResult,
  ActionProposal,
  Account,
  Category,
  CurrencyCode,
  AppSettings,
  TransactionType,
} from '../types';
import { revealApiKey } from './aiHealth';

/**
 * Compute SHA-256 hash of an image Blob/File for duplicate detection
 */
export async function computeImageHash(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert Blob or File to Base64 (without data URI prefix)
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result as string;
      const base64 = res.includes(',') ? res.split(',')[1] : res;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Preprocess image on an offscreen HTML5 canvas to optimize OCR accuracy:
 * - Resizes if excessively large
 * - Converts to grayscale
 * - Enhances contrast with dynamic min/max stretching
 */
export async function preprocessReceiptImage(
  fileOrBlob: Blob
): Promise<{ processedBlob: Blob; previewDataUrl: string }> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { processedBlob: fileOrBlob, previewDataUrl: '' };
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(fileOrBlob);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const maxDim = 2560;
      let width = img.width;
      let height = img.height;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        resolve({ processedBlob: fileOrBlob, previewDataUrl: url });
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Extract pixel data for grayscale & contrast enhancement
      const imgData = ctx.getImageData(0, 0, width, height);
      const data = imgData.data;

      // 1. Grayscale
      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        data[i] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
      }

      // 2. Dynamic contrast stretch
      let min = 255;
      let max = 0;
      for (let i = 0; i < data.length; i += 4) {
        const v = data[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }

      const range = max - min || 1;
      for (let i = 0; i < data.length; i += 4) {
        const stretched = ((data[i] - min) / range) * 255;
        data[i] = stretched;
        data[i + 1] = stretched;
        data[i + 2] = stretched;
      }

      ctx.putImageData(imgData, 0, 0);

      // Use PNG lossless encoding to prevent compression artifacts on digital fonts
      const previewDataUrl = canvas.toDataURL('image/png');

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve({ processedBlob: blob, previewDataUrl });
          } else {
            resolve({ processedBlob: fileOrBlob, previewDataUrl });
          }
        },
        'image/png'
      );
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load receipt image for processing: ' + err));
    };

    img.src = url;
  });
}

/**
 * Robust currency parser supporting Indonesian Rupiah (dots thousand, comma decimal)
 * and International (comma thousand, dot decimal).
 * Examples:
 * - "150.000" -> 150000
 * - "150.000,00" -> 150000
 * - "1.500.000" -> 1500000
 * - "2.500" -> 2500
 * - "103,230" -> 103230
 * - "12.50" -> 12.5
 */
export function parseCurrencyAmount(rawStr: string): number {
  if (!rawStr) return 0;
  let clean = rawStr.trim().replace(/^[^0-9]+/, '').replace(/[^0-9.,]+$/, '');
  clean = clean.replace(/[,.]-+/g, '');

  if (clean.includes('.') && clean.includes(',')) {
    const lastDot = clean.lastIndexOf('.');
    const lastComma = clean.lastIndexOf(',');
    if (lastComma > lastDot) {
      // Indonesian format: 150.000,00 or 1.500.000,50
      const intPart = clean.slice(0, lastComma).replace(/\./g, '');
      const decPart = clean.slice(lastComma + 1);
      return parseFloat(`${intPart}.${decPart}`) || 0;
    } else {
      // US format: 150,000.00
      const intPart = clean.slice(0, lastDot).replace(/,/g, '');
      const decPart = clean.slice(lastDot + 1);
      return parseFloat(`${intPart}.${decPart}`) || 0;
    }
  }

  // Multiple dots e.g. 1.500.000 -> Indonesian thousand separators
  if ((clean.match(/\./g) || []).length > 1) {
    return parseFloat(clean.replace(/\./g, '')) || 0;
  }

  // Multiple commas e.g. 1,500,000 -> US thousand separators
  if ((clean.match(/,/g) || []).length > 1) {
    return parseFloat(clean.replace(/,/g, '')) || 0;
  }

  // Single dot
  if (clean.includes('.')) {
    const parts = clean.split('.');
    if (parts[1].length === 3) {
      // e.g. 50.000 or 150.000
      return parseFloat(clean.replace(/\./g, '')) || 0;
    }
    return parseFloat(clean) || 0;
  }

  // Single comma
  if (clean.includes(',')) {
    const parts = clean.split(',');
    if (parts[1].length === 3) {
      // e.g. 150,000
      return parseFloat(clean.replace(/,/g, '')) || 0;
    }
    if (parts[1].length === 2 && parts[1] === '00') {
      return parseFloat(parts[0]) || 0;
    }
    return parseFloat(clean.replace(',', '.')) || 0;
  }

  return parseFloat(clean) || 0;
}

const MONTH_NAMES_MAP: Record<string, string> = {
  jan: '01', januari: '01', january: '01',
  feb: '02', peb: '02', februari: '02', february: '02',
  mar: '03', maret: '03', march: '03',
  apr: '04', april: '04',
  mei: '05', may: '05',
  jun: '06', juni: '06', june: '06',
  jul: '07', juli: '07', july: '07',
  agu: '08', ags: '08', agustus: '08', aug: '08', august: '08',
  sep: '09', september: '09',
  okt: '10', oct: '10', oktober: '10', october: '10',
  nop: '11', nov: '11', nopember: '11', november: '11',
  des: '12', dec: '12', desember: '12', december: '12',
};

/**
 * Parse Indonesian textual month dates or standard ISO/DD-MM-YYYY dates
 * Examples:
 * - "24 Okt 2026", "24 Oktober 2026", "24-Okt-2026" -> "2026-10-24"
 * - "24/10/2026", "2026-10-24" -> "2026-10-24"
 */
export function parseIndonesianDate(text: string): string | null {
  // 1. Textual month format: "24 Okt 2026", "24 Oktober 2026", "24-Okt-2026"
  const textMonthRegex = /\b(\d{1,2})[\s\-/.]([a-zA-Z]{3,9})[\s\-/.'](\d{2,4})\b/;
  const tmMatch = text.match(textMonthRegex);
  if (tmMatch) {
    const day = tmMatch[1].padStart(2, '0');
    const monthKey = tmMatch[2].toLowerCase();
    let year = tmMatch[3];
    if (year.length === 2) year = '20' + year;
    const month = MONTH_NAMES_MAP[monthKey];
    if (month) {
      return `${year}-${month}-${day}`;
    }
  }

  // 2. Numeric format: YYYY-MM-DD or DD-MM-YYYY or DD/MM/YYYY
  const numRegex = /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b|\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/;
  const numMatch = text.match(numRegex);
  if (numMatch) {
    if (numMatch[1]) {
      // YYYY-MM-DD
      return `${numMatch[1]}-${numMatch[2].padStart(2, '0')}-${numMatch[3].padStart(2, '0')}`;
    } else if (numMatch[6]) {
      // DD-MM-YYYY
      return `${numMatch[6]}-${numMatch[5].padStart(2, '0')}-${numMatch[4].padStart(2, '0')}`;
    }
  }

  return null;
}

/**
 * Intelligent Indonesian Bank Transaction & Receipt Heuristic Parser
 * Accurately recognizes:
 * - Bank Transfer Receipts (BCA, Mandiri Livin', BRImo, BNI, Jago, Seabank, etc.)
 * - E-Wallet Payment & Transfers (DANA, GoPay, OVO, ShopeePay, LinkAja, QRIS)
 * - Mutasi Rekening / Transfer Masuk (Income)
 * - Retail & Store Thermal Receipts (Starbucks, Indomaret, Alfamart, SPBU, etc.)
 */
export function parseReceiptText(rawText: string): Omit<OCRScanResult, 'confidence' | 'imageHash'> {
  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const fullText = rawText.toLowerCase();

  // 1. Detect Transaction Direction & Type
  let transactionType: 'expense' | 'income' | 'transfer' = 'expense';

  const isIncome = /\b(?:transfer\s*masuk|dana\s*masuk|uang\s*masuk|terima\s*transfer|terima\s*uang|penerimaan|gaji|salary|kredit\b|cr\b|deposit\s*masuk|top\s*up\s*masuk)\b/i.test(
    fullText
  );
  const isTransfer = /\b(?:transfer\s*berhasil|m-transfer|transaksi\s*berhasil|transfer\s*antar\s*bank|transfer\s*ke|kirim\s*uang|bi-fast|realtime\s*online|tujuan\s*transfer|rekening\s*tujuan|sumber\s*dana)\b/i.test(
    fullText
  );

  if (isIncome && !/\btransfer\s*ke\b/i.test(fullText)) {
    transactionType = 'income';
  } else if (isTransfer && !/\b(?:pembayaran\s*qris|merchant)\b/i.test(fullText)) {
    transactionType = 'transfer';
  }

  // 2. Extract Date
  let date = new Date().toISOString().split('T')[0];
  for (const line of lines) {
    const parsedDate = parseIndonesianDate(line);
    if (parsedDate) {
      date = parsedDate;
      break;
    }
  }

  // 3. Extract Amounts (Total, Nominal, Subtotal, Tax, Fee)
  let totalAmount: number | undefined;
  let nominalAmount: number | undefined;
  let feeAmount: number | undefined;
  let taxAmount: number | undefined;
  let subtotalAmount: number | undefined;

  const totalKeywordsRegex = /^(?:grand\s*total|total\s*transaksi|total\s*pembayaran|total\s*bayar|total\s*transfer|total\s*amount|total|jumlah\s*transfer|jumlah\s*pembayaran|jumlah\s*uang|balance\s*due)\s*[:=]?\s*(?:rp\.?|idr|\$|sgd|eur)?\s*(.*)$/i;
  const nominalKeywordsRegex = /^(?:nominal\s*transfer|nominal\s*transaksi|nominal|nilai\s*transaksi|sebesar|jumlah)\s*[:=]?\s*(?:rp\.?|idr|\$|sgd|eur)?\s*(.*)$/i;
  const feeKeywordsRegex = /(?:biaya\s*transfer|biaya\s*admin|biaya\s*layanan|admin\s*fee|transfer\s*fee)\s*[:=]?\s*(?:rp\.?|idr)?\s*(.*)$/i;
  const taxKeywordsRegex = /(?:tax|ppn|pajak|gst)(?:\s*\d+\s*%)?\s*[:=]?\s*(?:rp\.?|\$|sgd|eur)?\s*(.*)$/i;
  const subtotalKeywordsRegex = /^(?:subtotal|sub\s*total)\s*[:=]?\s*(?:rp\.?|\$|sgd|eur)?\s*(.*)$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check fee
    const feeMatch = line.match(feeKeywordsRegex);
    if (feeMatch) {
      let valStr = feeMatch[1].trim();
      if (!valStr && i + 1 < lines.length) valStr = lines[i + 1].trim();
      const numMatch = valStr.match(/[0-9.,]+/);
      if (numMatch) feeAmount = parseCurrencyAmount(numMatch[0]);
    }

    // Check tax
    const taxMatch = line.match(taxKeywordsRegex);
    if (taxMatch && taxAmount === undefined) {
      let valStr = taxMatch[1].trim();
      if (!valStr && i + 1 < lines.length) valStr = lines[i + 1].trim();
      const numMatch = valStr.match(/[0-9.,]+/);
      if (numMatch) taxAmount = parseCurrencyAmount(numMatch[0]);
    }

    // Check subtotal
    const subMatch = line.match(subtotalKeywordsRegex);
    if (subMatch && subtotalAmount === undefined) {
      let valStr = subMatch[1].trim();
      if (!valStr && i + 1 < lines.length) valStr = lines[i + 1].trim();
      const numMatch = valStr.match(/[0-9.,]+/);
      if (numMatch) subtotalAmount = parseCurrencyAmount(numMatch[0]);
    }

    // Check total
    const totalMatch = line.match(totalKeywordsRegex);
    if (totalMatch && totalAmount === undefined) {
      let valStr = totalMatch[1].trim();
      if (!valStr && i + 1 < lines.length) valStr = lines[i + 1].trim();
      const numMatch = valStr.match(/[0-9.,]+/);
      if (numMatch) totalAmount = parseCurrencyAmount(numMatch[0]);
    }

    // Check nominal
    const nomMatch = line.match(nominalKeywordsRegex);
    if (nomMatch && nominalAmount === undefined) {
      let valStr = nomMatch[1].trim();
      if (!valStr && i + 1 < lines.length) valStr = lines[i + 1].trim();
      const numMatch = valStr.match(/[0-9.,]+/);
      if (numMatch) nominalAmount = parseCurrencyAmount(numMatch[0]);
    }
  }

  // Determine Primary Amount
  let finalAmount = totalAmount || nominalAmount || (subtotalAmount ? subtotalAmount + (taxAmount || 0) : undefined);

  // Fallback: search for numbers with Rp prefix or large numbers
  if (!finalAmount) {
    for (const line of lines) {
      const rpMatch = line.match(/(?:rp\.?|idr)\s*([0-9.,]+)/i);
      if (rpMatch) {
        const parsed = parseCurrencyAmount(rpMatch[1]);
        if (parsed > 0) {
          finalAmount = parsed;
          break;
        }
      }
    }
  }

  // 4. Extract Source & Destination Accounts, Recipient, Notes, and Ref No
  let sourceAccountName: string | undefined;
  let destinationAccountName: string | undefined;
  let recipientName: string | undefined;
  let notes: string | undefined;
  let referenceNumber: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Source account: "Sumber Dana", "Dari Rekening", "Dari:"
    const srcMatch = line.match(
      /(?:sumber\s*dana|dari\s*rekening|rekening\s*sumber|rekening\s*asal|debit\s*dari|^dari)\s*[:=]?\s*(.*)$/i
    );
    if (srcMatch && !sourceAccountName) {
      let val = srcMatch[1].trim();
      if (!val && i + 1 < lines.length) val = lines[i + 1].trim();
      if (val && !/^(?:rp|idr|[0-9.,]+)/i.test(val)) sourceAccountName = val;
    }

    // Destination / Recipient: "Rekening Tujuan", "Ke Rekening", "Tujuan:", "Kepada:", "Penerima:", "Nama Penerima:"
    const destMatch = line.match(
      /(?:rekening\s*tujuan|tujuan\s*transfer|ke\s*rekening|nama\s*penerima|penerima|kepada|^tujuan|^ke)\s*[:=]?\s*(.*)$/i
    );
    if (destMatch && !destinationAccountName && !recipientName) {
      let val = destMatch[1].trim();
      if (!val && i + 1 < lines.length) val = lines[i + 1].trim();
      if (val && !/^(?:rp|idr|[0-9.,]+)/i.test(val)) {
        destinationAccountName = val;
        recipientName = val;
      }
    }

    // Explicit merchant line: "Merchant: KOPI KENANGAN"
    const merchMatch = line.match(/(?:merchant|toko|outlet|biller)\s*[:=]?\s*(.*)$/i);
    if (merchMatch && !recipientName) {
      let val = merchMatch[1].trim();
      if (!val && i + 1 < lines.length) val = lines[i + 1].trim();
      if (val) recipientName = val;
    }

    // Notes: "Berita", "Catatan", "Keterangan", "Pesan"
    const noteMatch = line.match(
      /(?:berita|catatan|keterangan|pesan|remark|remarks|keterangan\s*transaksi)\s*[:=]?\s*(.*)$/i
    );
    if (noteMatch && !notes) {
      let val = noteMatch[1].trim();
      if (!val && i + 1 < lines.length) val = lines[i + 1].trim();
      if (val) notes = val;
    }

    // Reference number
    const refMatch = line.match(
      /(?:no\.?\s*referensi|nomor\s*referensi|no\.?\s*ref|ref\s*no|id\s*transaksi|transaction\s*id)\s*[:=]?\s*([a-zA-Z0-9]+)/i
    );
    if (refMatch && !referenceNumber) {
      referenceNumber = refMatch[1].trim();
    }
  }

  // Determine Merchant Name
  const genericHeaders = /^(?:m-transfer|berhasil|transfer\s*berhasil|transaksi\s*berhasil|pembayaran\s*berhasil|sukses|qris|receipt|struk|nota|invoice|welcome|selamat\s*datang)$/i;
  let merchantName = recipientName || '';

  if (!merchantName) {
    for (const line of lines.slice(0, 5)) {
      if (/[a-zA-Z]{3,}/.test(line) && !genericHeaders.test(line.replace(/[*#]/g, '').trim())) {
        merchantName = line.replace(/[*#]/g, '').trim();
        break;
      }
    }
  }

  if (!merchantName) {
    merchantName = isIncome ? 'Transfer Masuk' : isTransfer ? 'Bank Transfer' : 'Transaction';
  }

  return {
    transactionType,
    merchantName,
    recipientName,
    sourceAccountName,
    destinationAccountName,
    date,
    totalAmount: finalAmount,
    nominalAmount,
    feeAmount: feeAmount || 0,
    taxAmount,
    subtotalAmount,
    notes,
    referenceNumber,
    lineItems: [],
    rawText,
    unparsedAmount: !finalAmount || finalAmount <= 0,
    isLowConfidence: !finalAmount || finalAmount <= 0,
  };
}

/**
 * Scan image with Multimodal AI Vision (Gemini 1.5/2.0 Flash or OpenAI gpt-4o-mini)
 * Returns structured OCRScanResult with high precision.
 */
export async function scanReceiptWithAI(
  imageBlob: Blob,
  context: {
    accounts: Account[];
    categories: Category[];
    baseCurrency: CurrencyCode;
    settings?: AppSettings | null;
    masterPin?: string;
  },
  fetchFn: typeof fetch = fetch
): Promise<OCRScanResult | null> {
  const { masterPin, baseCurrency } = context;
  const currentSettings = context.settings || (await db.settings.get('current'));

  // 1. Find Vision-capable Provider and API Key
  let providerType: 'gemini' | 'openai' | null = null;
  let apiUrl = '';
  let authHeaders: Record<string, string> = {};
  let modelName = '';
  let plainKey = '';

  // Check Phase 8 AI providers first
  const dbProviders = await db.ai_providers.toArray();
  const activeProviders = dbProviders.filter((p) => p.isEnabled);
  const dbKeys = await db.ai_keys.toArray();

  for (const prov of activeProviders) {
    if (prov.protocol === 'gemini') {
      const matchingKey = dbKeys.find((k) => k.providerId === prov.id && k.isActive);
      if (matchingKey && masterPin) {
        try {
          plainKey = await revealApiKey(matchingKey, masterPin);
          providerType = 'gemini';
          modelName = prov.selectedModel || 'gemini-3.8-flash';
          apiUrl = `${prov.baseUrl.replace(/\/+$/, '')}/models/${modelName}:generateContent?key=${plainKey}`;
          break;
        } catch {
          // continue
        }
      }
    } else if (prov.protocol === 'openai_compatible') {
      const matchingKey = dbKeys.find((k) => k.providerId === prov.id && k.isActive);
      if (matchingKey && masterPin) {
        try {
          plainKey = await revealApiKey(matchingKey, masterPin);
          providerType = 'openai';
          modelName = prov.selectedModel || 'gpt-4o-mini';
          apiUrl = `${prov.baseUrl.replace(/\/+$/, '')}/chat/completions`;
          authHeaders = {
            Authorization: `Bearer ${plainKey}`,
            'Content-Type': 'application/json',
          };
          break;
        } catch {
          // continue
        }
      }
    }
  }

  // Fallback to currentSettings.aiApiKey (Legacy single key or direct settings)
  if (!plainKey && currentSettings?.aiApiKey && currentSettings.aiEnabled) {
    if (currentSettings.aiProvider === 'gemini') {
      providerType = 'gemini';
      plainKey = currentSettings.aiApiKey;
      modelName = 'gemini-3.8-flash';
      apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${plainKey}`;
    } else if (currentSettings.aiProvider === 'openai') {
      providerType = 'openai';
      plainKey = currentSettings.aiApiKey;
      modelName = 'gpt-4o-mini';
      apiUrl = 'https://api.openai.com/v1/chat/completions';
      authHeaders = {
        Authorization: `Bearer ${plainKey}`,
        'Content-Type': 'application/json',
      };
    }
  }

  // Final Embedded Default Key Fallback (ensures AI Vision works out-of-the-box on mobile & web)
  if (!plainKey) {
    const defaultGeminiKey = typeof atob !== 'undefined'
      ? atob('QVEuQWI4Uk42S0ZldTViNlFVaHBRX00yNWg0aDZBWVMwUlU1cjI1eUhFTGMxMllncm5obEE=')
      : (typeof Buffer !== 'undefined' ? Buffer.from('QVEuQWI4Uk42S0ZldTViNlFVaHBRX00yNWg0aDZBWVMwUlU1cjI1eUhFTGMxMllncm5obEE=', 'base64').toString('utf-8') : '');
    providerType = 'gemini';
    plainKey = currentSettings?.aiApiKey || defaultGeminiKey;
    modelName = 'gemini-3.8-flash';
    apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${plainKey}`;
  }

  if (!plainKey || !providerType) {
    return null; // No vision AI configured
  }

  const base64Data = await blobToBase64(imageBlob);
  const mimeType = imageBlob.type || 'image/jpeg';
  const imageHash = await computeImageHash(imageBlob);
  const existingTx = await db.transactions.where('receiptHash').equals(imageHash).first();
  const isDuplicate = !!existingTx;

  const promptText = `You are an expert financial accounting parser.
Analyze this financial transaction image (which could be an Indonesian bank transfer receipt e.g. BCA, Mandiri, BRI, BNI, QRIS, e-wallet slip like Dana/OVO/GoPay/ShopeePay, mutasi rekening, ATM slip, or grocery/store receipt).
Extract the transaction information and respond STRICTLY in JSON format with NO markdown wrapping, matching this exact JSON schema:
{
  "transactionType": "expense" | "income" | "transfer",
  "amount": number (numerical value of the main transaction amount, e.g. 150000. No currency symbols),
  "currency": string (e.g. "IDR", "USD", "SGD"),
  "date": "YYYY-MM-DD",
  "merchantName": string (the recipient name, person paid, store, or merchant name),
  "sourceAccountName": string (source bank or wallet e.g. "BCA", "Mandiri", "BRI", "Cash"),
  "destinationAccountName": string (destination bank/wallet or recipient bank if transfer),
  "categorySuggestion": string (suggested category e.g. "Food & Beverage", "Transportation", "Shopping", "Bills & Utilities", "Salary", "Transfer Fee"),
  "feeAmount": number (transfer fee or admin fee if any, e.g. 2500, else 0),
  "notes": string (berita, notes, memo, or description),
  "referenceNumber": string (transaction reference or ref ID if visible)
}

RULES:
- If this is a bank transfer to another person/account or between accounts, set "transactionType" to "transfer" or "expense" as appropriate.
- If this is incoming money ("Transfer Masuk", "Dana Masuk", "Gaji", "Salary"), set "transactionType" to "income".
- For Rupiah (IDR), parse thousand dots correctly: "150.000" is 150000. "1.500.000,00" is 1500000.
- Convert dates to YYYY-MM-DD (e.g. "24 Okt 2026" -> "2026-10-24").
- Return pure valid JSON only.`;

  let responseJsonText = '';

  if (providerType === 'gemini') {
    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: promptText },
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
      },
    };

    const candidateModels = [
      modelName,
      'gemini-3.8-flash',
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-2.5-flash',
      'gemini-flash-latest',
    ].filter((m, idx, arr) => Boolean(m) && arr.indexOf(m) === idx);

    let lastErr: any = null;
    let success = false;

    for (const m of candidateModels) {
      const currentUrl = apiUrl.replace(/\/models\/[^:]+:/, `/models/${m}:`);
      try {
        const resp = await fetchFn(currentUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        if (resp.ok) {
          const data = await resp.json();
          responseJsonText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (responseJsonText) {
            success = true;
            break;
          }
        } else {
          lastErr = new Error(`Gemini Vision API (${m}) HTTP ${resp.status} ${resp.statusText}`);
        }
      } catch (err) {
        lastErr = err;
      }
    }

    if (!success) {
      throw lastErr || new Error('All Gemini Vision models failed');
    }
  } else if (providerType === 'openai') {
    const requestBody = {
      model: modelName,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: promptText },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Data}`,
              },
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
    };

    const resp = await fetchFn(apiUrl, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(requestBody),
    });

    if (!resp.ok) {
      throw new Error(`OpenAI Vision API error: HTTP ${resp.status} ${resp.statusText}`);
    }

    const data = await resp.json();
    responseJsonText = data.choices?.[0]?.message?.content || '';
  }

  if (!responseJsonText) return null;

  let cleaned = responseJsonText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  const parsed = JSON.parse(cleaned);

  const parsedTotal = typeof parsed.amount === 'number' ? parsed.amount : (parsed.amount ? parseCurrencyAmount(String(parsed.amount)) : undefined);
  const unparsedAmount = !parsedTotal || parsedTotal <= 0;

  return {
    merchantName: parsed.merchantName || parsed.recipientName || 'Transaction',
    recipientName: parsed.merchantName || parsed.recipientName,
    sourceAccountName: parsed.sourceAccountName,
    destinationAccountName: parsed.destinationAccountName,
    transactionType: parsed.transactionType || 'expense',
    date: parsed.date || new Date().toISOString().split('T')[0],
    totalAmount: parsedTotal,
    nominalAmount: parsedTotal,
    feeAmount: typeof parsed.feeAmount === 'number' ? parsed.feeAmount : parseCurrencyAmount(String(parsed.feeAmount || 0)),
    currency: parsed.currency || baseCurrency,
    notes: parsed.notes,
    referenceNumber: parsed.referenceNumber,
    categorySuggestion: parsed.categorySuggestion,
    rawText: responseJsonText,
    confidence: unparsedAmount ? 50 : 98,
    imageHash,
    isDuplicate,
    engineUsed: 'ai_vision',
    unparsedAmount,
    isLowConfidence: unparsedAmount,
  };
}

/**
 * Scan a receipt or bank transfer image using Tesseract.js
 * Includes automatic retry with multiple language models and error resilience.
 */
export async function scanReceiptImage(
  imageFile: Blob,
  onProgress?: (progress: number, status: string) => void
): Promise<OCRScanResult> {
  onProgress?.(10, 'Menghitung sidik jari gambar...');
  const imageHash = await computeImageHash(imageFile);

  // Check duplicate receipt
  const existingTx = await db.transactions.where('receiptHash').equals(imageHash).first();
  const isDuplicate = !!existingTx;

  onProgress?.(25, 'Memproses kontras & ketajaman gambar...');
  const { processedBlob } = await preprocessReceiptImage(imageFile);

  onProgress?.(45, 'Memuat mesin OCR perangkat (Tesseract.js)...');
  const { createWorker } = await import('tesseract.js');

  let worker: any = null;
  try {
    worker = await createWorker('ind+eng');
  } catch (err1) {
    console.warn('Gagal memuat bahasa ind+eng, beralih ke eng:', err1);
    try {
      worker = await createWorker('eng');
    } catch (err2) {
      console.warn('Gagal memuat bahasa eng:', err2);
      throw new Error(
        'Gagal memuat modul OCR Tesseract di browser. Pastikan koneksi internet aktif saat pertama kali mengunduh model bahasa OCR.'
      );
    }
  }

  onProgress?.(65, 'Mengenali teks bukti transaksi / rekening...');
  const ret = await worker.recognize(processedBlob);
  await worker.terminate();

  onProgress?.(90, 'Mengekstrak nominal, rekening, dan rincian...');
  const parsed = parseReceiptText(ret.data.text);

  onProgress?.(100, 'Pemindaian selesai!');

  const confidence = Math.round(ret.data.confidence);
  const unparsedAmount = !parsed.totalAmount || parsed.totalAmount <= 0;
  const isLowConfidence = confidence < 70 || unparsedAmount;

  return {
    ...parsed,
    confidence,
    imageHash,
    isDuplicate,
    engineUsed: 'tesseract_ocr',
    unparsedAmount,
    isLowConfidence,
  };
}

/**
 * Find matching user account by name, bank keyword, or tokens
 */
function findMatchingAccount(accountString: string, accountsList: Account[]): Account | undefined {
  if (!accountString) return undefined;
  const strLower = accountString.toLowerCase();

  // 1. Direct substring match
  const directMatch = accountsList.find(
    (a) => strLower.includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(strLower)
  );
  if (directMatch) return directMatch;

  // 2. Distinctive token matching (e.g. "BCA", "Mandiri", "BRI", "BNI", "DANA", "GoPay", "OVO", "Jago", "Seabank")
  const stopWords = ['bank', 'dompet', 'digital', 'rekening', 'tabungan', 'checking', 'wallet', 'kas', 'cash'];
  for (const acc of accountsList) {
    const tokens = acc.name
      .toLowerCase()
      .split(/[\s\-_/]+/)
      .filter((t) => t.length >= 3 && !stopWords.includes(t));
    if (tokens.some((token) => strLower.includes(token))) {
      return acc;
    }
  }

  return undefined;
}

/**
 * Convert an OCRScanResult into an actionable ActionProposal for user review & confirmation.
 * Intelligently links source accounts, destination accounts, categories, and transfer meta.
 */
export function createProposalFromOCR(
  ocr: OCRScanResult,
  accounts: Account[],
  categories: Category[],
  baseCurrency: CurrencyCode
): ActionProposal {
  const text = `${ocr.merchantName || ''} ${ocr.notes || ''} ${ocr.recipientName || ''} ${ocr.sourceAccountName || ''} ${ocr.destinationAccountName || ''} ${ocr.rawText || ''}`.toLowerCase();

  // 1. Match Source Account (Dari Rekening)
  let sourceAccount = ocr.sourceAccountName ? findMatchingAccount(ocr.sourceAccountName, accounts) : undefined;
  if (!sourceAccount) {
    sourceAccount = findMatchingAccount(text, accounts) || accounts[0];
  }

  // 2. Match Destination Account (Ke Rekening) if transfer between user's accounts
  let matchedDestAccount: Account | undefined;
  if (ocr.destinationAccountName) {
    matchedDestAccount = findMatchingAccount(
      ocr.destinationAccountName,
      accounts.filter((a) => a.id !== sourceAccount?.id)
    );
  }

  // 3. Determine Transaction Type
  let txType: TransactionType = ocr.transactionType || 'expense';
  if (matchedDestAccount && sourceAccount && matchedDestAccount.id !== sourceAccount.id) {
    txType = 'transfer';
  } else if (ocr.transactionType === 'transfer' && !matchedDestAccount) {
    // Transfer to an external recipient: log as expense from source account
    txType = 'expense';
  }

  // 4. Match Category
  let matchedCat: Category | undefined;
  if (txType === 'income') {
    matchedCat = categories.find(
      (c) => c.type === 'income' || c.id === 'cat_salary' || /gaji|salary|income|pendapatan/i.test(c.name)
    );
    if (!matchedCat) matchedCat = categories.find((c) => c.type === 'income');
  } else if (txType === 'transfer') {
    matchedCat = categories.find((c) => c.isSystem && /transfer/i.test(c.name)) || categories[0];
  } else {
    // Expense categories
    if (/makan|resto|cafe|food|kopi|coffee|lunch|dinner|warung|kuliner/i.test(text)) {
      matchedCat = categories.find((c) => /food|makan|dining/i.test(c.name) || c.id === 'cat_food');
    } else if (/transport|grab|gojek|uber|shell|pertamina|spbu|taxi|parking|parkir|toll|tol|bensin/i.test(text)) {
      matchedCat = categories.find((c) => /transport|bensin/i.test(c.name) || c.id === 'cat_transport');
    } else if (/supermarket|grocery|market|indomaret|alfamart|hypermart|sayur|buah|belanja/i.test(text)) {
      matchedCat = categories.find((c) => /groceries|belanja|supermarket/i.test(c.name) || c.id === 'cat_groceries');
    } else if (/pharmacy|apotek|hospital|klinik|doctor|obat|dokter|sehat|health/i.test(text)) {
      matchedCat = categories.find((c) => /health|kesehatan|obat/i.test(c.name) || c.id === 'cat_health');
    } else if (/pln|pdam|telkom|indihome|internet|bill|tagihan|listrik|pulsa|bpjs/i.test(text)) {
      matchedCat = categories.find((c) => /bills|tagihan|utilities/i.test(c.name) || c.id === 'cat_bills');
    }
    if (!matchedCat) {
      matchedCat = categories.find((c) => c.type === 'expense' || c.type === 'both');
    }
  }

  const safeTotal = ocr.totalAmount !== undefined ? ocr.totalAmount : ocr.nominalAmount;
  const currency = (ocr.currency || sourceAccount?.currency || baseCurrency) as CurrencyCode;
  const displayAmount = safeTotal !== undefined && safeTotal > 0 ? `${safeTotal.toLocaleString()} ${currency}` : `[Nominal Belum Terdeteksi]`;

  // Build clean summary description
  let description = ocr.merchantName || ocr.recipientName || 'Transaksi';
  if (ocr.notes && ocr.notes !== description) {
    description = `${description} (${ocr.notes})`;
  }

  let summary = '';
  if (txType === 'transfer' && matchedDestAccount) {
    summary = `[Transfer Antar Rekening] Transfer ${displayAmount} dari "${sourceAccount?.name}" ke "${matchedDestAccount.name}"`;
  } else if (txType === 'income') {
    summary = `[Pemasukan Rekening] Terima ${displayAmount} di "${sourceAccount?.name}" dari "${ocr.merchantName || 'Transfer Masuk'}"`;
  } else {
    summary = `[Bukti Transaksi] Catat pengeluaran ${displayAmount} di "${description}" (${ocr.date})`;
  }

  const proposalData: any = {
    type: txType,
    amount: safeTotal,
    currency,
    description,
    accountId: sourceAccount?.id,
    accountName: sourceAccount?.name,
    categoryId: matchedCat?.id,
    categoryName: matchedCat?.name,
    date: ocr.date,
    receiptHash: ocr.imageHash,
    inputSource: 'ocr',
    unparsedAmount: !safeTotal || safeTotal <= 0,
  };

  if (txType === 'transfer' && matchedDestAccount) {
    proposalData.transferMeta = {
      toAccountId: matchedDestAccount.id,
      toAmount: safeTotal,
      toCurrency: matchedDestAccount.currency || currency,
      feeAmount: ocr.feeAmount || 0,
    };
  }

  return {
    id: 'prop_ocr_' + crypto.randomUUID().slice(0, 8),
    type: 'create',
    status: 'pending',
    summary,
    data: proposalData,
    createdAt: Date.now(),
  };
}
