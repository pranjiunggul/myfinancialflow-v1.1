/**
 * Bulk Transaction History Screenshot OCR & Parsing Engine
 * Supports:
 * - Detecting repeated transaction blocks/rows in banking & e-wallet history screenshots
 *   (e.g. ShopeePay, GoPay, OVO, DANA, BCA Mutasi Rekening, Mandiri Livin, BRImo, etc.)
 * - Multimodal AI Vision structured row extraction (when AI is enabled)
 * - Deterministic multi-line regex block segmenter fallback for Tesseract OCR / raw text
 * - Row-level duplicate detection across rows & existing ledger transactions
 * - Account matching & Category auto-suggestion
 * - Produces ActionProposal batches compatible with the unified confirmation gate
 */

import { db } from '../db/database';
import type {
  Account,
  Category,
  CurrencyCode,
  TransactionType,
  AppSettings,
} from '../types';
import {
  parseCurrencyAmount,
  parseIndonesianDate,
  blobToBase64,
  computeImageHash,
  preprocessReceiptImage,
} from './ocr';
import { revealApiKey } from './aiHealth';

export interface HistoryRowParsedItem {
  id: string;
  sourceImageHash: string;
  date: string;
  description: string;
  amount: number;
  type: TransactionType;
  currency: CurrencyCode;
  suggestedAccountId: string;
  suggestedAccountName: string;
  suggestedCategoryId: string;
  suggestedCategoryName: string;
  isDuplicate: boolean;
  duplicateReason?: string;
  confidence: number;
  selected: boolean;
}

/**
 * Determine category suggestion based on transaction description text
 */
export function suggestCategoryForDescription(
  description: string,
  type: TransactionType,
  categories: Category[]
): Category {
  const text = description.toLowerCase();

  if (type === 'income') {
    const salaryCat = categories.find(
      (c) => c.type === 'income' || /gaji|salary|income|pendapatan|transfer masuk/i.test(c.name)
    );
    if (salaryCat) return salaryCat;
    const anyIncome = categories.find((c) => c.type === 'income');
    if (anyIncome) return anyIncome;
  }

  if (type === 'transfer') {
    const transferCat = categories.find((c) => c.isSystem && /transfer/i.test(c.name));
    if (transferCat) return transferCat;
  }

  // Expense keyword heuristics
  if (/makan|resto|cafe|food|kopi|coffee|lunch|dinner|warung|kuliner|bakso|soto|mie|mcd|kfc/i.test(text)) {
    const cat = categories.find((c) => /food|makan|dining/i.test(c.name) || c.id === 'cat_food');
    if (cat) return cat;
  }
  if (/transport|grab|gojek|uber|shell|pertamina|spbu|taxi|parking|parkir|toll|tol|bensin|kereta|kai|mrt/i.test(text)) {
    const cat = categories.find((c) => /transport|bensin/i.test(c.name) || c.id === 'cat_transport');
    if (cat) return cat;
  }
  if (/supermarket|grocery|market|indomaret|alfamart|hypermart|sayur|buah|belanja|shopee|tokopedia/i.test(text)) {
    const cat = categories.find((c) => /groceries|belanja|supermarket/i.test(c.name) || c.id === 'cat_groceries');
    if (cat) return cat;
  }
  if (/pharmacy|apotek|hospital|klinik|doctor|obat|dokter|sehat|health/i.test(text)) {
    const cat = categories.find((c) => /health|kesehatan|obat/i.test(c.name) || c.id === 'cat_health');
    if (cat) return cat;
  }
  if (/pln|pdam|telkom|indihome|internet|bill|tagihan|listrik|pulsa|bpjs/i.test(text)) {
    const cat = categories.find((c) => /bills|tagihan|utilities/i.test(c.name) || c.id === 'cat_bills');
    if (cat) return cat;
  }

  return (
    categories.find((c) => c.type === 'expense' || c.type === 'both') ||
    categories[0] || {
      id: 'cat_general',
      name: 'General',
      type: 'expense',
      icon: 'Tag',
      color: '#6b7280',
      isSystem: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deviceId: 'local',
      isDeleted: false,
      version: 1,
    }
  );
}

/**
 * Identify likely account from screenshot header or lines (e.g. "ShopeePay", "BCA", "GoPay")
 */
export function detectAccountFromText(fullText: string, accounts: Account[]): Account {
  const lines = fullText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const headerText = lines.slice(0, 4).join(' ').toLowerCase();

  // Priority 1: Match against header / title lines (first 4 lines)
  for (const acc of accounts) {
    const nameLower = acc.name.toLowerCase();
    if (headerText.includes(nameLower)) return acc;
    if (nameLower.includes('shopee') && /shopeepay|shopee/i.test(headerText)) return acc;
    if (nameLower.includes('gopay') && /gopay|gojek/i.test(headerText)) return acc;
    if (nameLower.includes('ovo') && /\bovo\b/i.test(headerText)) return acc;
    if (nameLower.includes('dana') && /\bdana\b/i.test(headerText)) return acc;
    if (nameLower.includes('bca') && /\bbca\b|klikbca|mybca/i.test(headerText)) return acc;
    if (nameLower.includes('mandiri') && /\bmandiri\b|livin/i.test(headerText)) return acc;
    if (nameLower.includes('bri') && /\bbri\b|brimo/i.test(headerText)) return acc;
    if (nameLower.includes('bni') && /\bbni\b/i.test(headerText)) return acc;
  }

  // Priority 2: Full text body fallback
  const lower = fullText.toLowerCase();
  for (const acc of accounts) {
    const nameLower = acc.name.toLowerCase();
    if (lower.includes(nameLower)) return acc;

    // Check common aliases
    if (nameLower.includes('shopee') && /shopeepay|shopee/i.test(lower)) return acc;
    if (nameLower.includes('gopay') && /gopay|gojek/i.test(lower)) return acc;
    if (nameLower.includes('ovo') && /\bovo\b/i.test(lower)) return acc;
    if (nameLower.includes('dana') && /\bdana\b/i.test(lower)) return acc;
    if (nameLower.includes('bca') && /\bbca\b|klikbca|mybca/i.test(lower)) return acc;
    if (nameLower.includes('mandiri') && /\bmandiri\b|livin/i.test(lower)) return acc;
    if (nameLower.includes('bri') && /\bbri\b|brimo/i.test(lower)) return acc;
    if (nameLower.includes('bni') && /\bbni\b/i.test(lower)) return acc;
  }

  return accounts[0] || {
    id: 'acc_default',
    name: 'Cash / Main Account',
    type: 'cash',
    currency: 'IDR',
    initialBalance: 0,
    currentBalance: 0,
    icon: 'Wallet',
    color: '#3b82f6',
    includeInNetWorth: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deviceId: 'local',
    isDeleted: false,
    version: 1,
  };
}

/**
 * Deterministic text parser for multi-row history screenshots.
 * Scans line by line, detecting row breaks and amount boundaries.
 */
export async function parseHistoryTextToRows(
  rawText: string,
  imageHash: string,
  accounts: Account[],
  categories: Category[],
  baseCurrency: CurrencyCode
): Promise<HistoryRowParsedItem[]> {
  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const matchedAccount = detectAccountFromText(rawText, accounts);
  const rows: HistoryRowParsedItem[] = [];

  // Regex patterns to identify amounts with signs or Rupiah keywords
  const amountRegex = /(?:([+-])\s*)?(?:rp\.?|idr)?\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?|[0-9]+)/i;
  const explicitSignAmountRegex = /([+-])\s*(?:rp\.?|idr)?\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?|[0-9]+)/i;

  let currentDate = new Date().toISOString().split('T')[0];
  let accumulatedDescription: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if line contains a standalone date
    const lineDate = parseIndonesianDate(line);
    if (lineDate) {
      currentDate = lineDate;
      continue;
    }

    // Skip generic system header lines
    if (/^(riwayat transaksi|mutasi rekening|history|transaksi|daftar transaksi|filter|semua)$/i.test(line)) {
      continue;
    }

    // Check if line contains an amount
    const signMatch = line.match(explicitSignAmountRegex);
    const generalAmountMatch = line.match(/(?:rp\.?|idr)\s*([0-9.,]+)/i);

    if (signMatch || generalAmountMatch) {
      const match = signMatch || generalAmountMatch;
      const sign = signMatch ? signMatch[1] : undefined;
      const numStr = signMatch ? signMatch[2] : match![1];
      const parsedAmount = parseCurrencyAmount(numStr);

      if (parsedAmount > 0) {
        // Line description: text before or around amount
        let descPart = line.replace(match![0], '').replace(/[#*:-]/g, '').trim();
        if (accumulatedDescription.length > 0) {
          descPart = `${accumulatedDescription.join(' ')} ${descPart}`.trim();
          accumulatedDescription = [];
        }

        if (!descPart) {
          // Check preceding line
          if (i > 0 && !lines[i - 1].match(amountRegex)) {
            descPart = lines[i - 1];
          } else {
            descPart = 'Transaksi';
          }
        }

        // Determine transaction direction/type
        let txType: TransactionType = 'expense';
        const lowerDesc = descPart.toLowerCase();

        if (
          sign === '+' ||
          /\b(?:top\s*up|masuk|terima|cashback|refund|penerimaan|gaji|bunga)\b/i.test(lowerDesc)
        ) {
          txType = 'income';
        } else if (/\b(?:transfer\s*ke|kirim\s*uang)\b/i.test(lowerDesc)) {
          txType = 'transfer';
        }

        const suggestedCat = suggestCategoryForDescription(descPart, txType, categories);

        rows.push({
          id: 'row_' + crypto.randomUUID().slice(0, 8),
          sourceImageHash: imageHash,
          date: currentDate,
          description: descPart,
          amount: parsedAmount,
          type: txType,
          currency: matchedAccount.currency || baseCurrency,
          suggestedAccountId: matchedAccount.id,
          suggestedAccountName: matchedAccount.name,
          suggestedCategoryId: suggestedCat.id,
          suggestedCategoryName: suggestedCat.name,
          isDuplicate: false,
          confidence: 85,
          selected: true,
        });
      }
    } else {
      // Buffer description text if short and non-numeric
      if (line.length > 2 && !/^[0-9:\s/.-]+$/.test(line)) {
        accumulatedDescription.push(line);
        if (accumulatedDescription.length > 3) {
          accumulatedDescription.shift();
        }
      }
    }
  }

  // Deduplicate against existing ledger transactions
  await markDuplicatesAgainstLedger(rows);

  return rows;
}

/**
 * Scan history screenshot using Multimodal AI Vision
 */
export async function parseHistoryScreenshotWithAI(
  imageBlob: Blob,
  context: {
    accounts: Account[];
    categories: Category[];
    baseCurrency: CurrencyCode;
    settings?: AppSettings | null;
    masterPin?: string;
  },
  fetchFn: typeof fetch = fetch
): Promise<HistoryRowParsedItem[] | null> {
  const { masterPin, baseCurrency, accounts, categories } = context;
  const currentSettings = context.settings || (await db.settings.get('current'));

  let apiKey = '';
  // Check Phase 8 AI keys first
  const dbProviders = await db.ai_providers.toArray();
  const dbKeys = await db.ai_keys.toArray();
  const geminiProv = dbProviders.find((p) => p.protocol === 'gemini' && p.isEnabled);
  if (geminiProv && masterPin) {
    const keyRecord = dbKeys.find((k) => k.providerId === geminiProv.id && k.isActive);
    if (keyRecord) {
      try {
        apiKey = await revealApiKey(keyRecord, masterPin);
      } catch {}
    }
  }

  // Fallback to legacy single key
  if (!apiKey && currentSettings?.aiApiKey) {
    apiKey = currentSettings.aiApiKey;
  }

  if (!apiKey) return null;

  const base64Data = await blobToBase64(imageBlob);
  const imageHash = await computeImageHash(imageBlob);

  const matchedAccount = detectAccountFromText(
    accounts.map((a) => a.name).join(' '),
    accounts
  );

  const prompt = `Anda adalah asisten data finansial. Analisis screenshot riwayat transaksi (misal: ShopeePay, GoPay, OVO, BCA, Livin Mandiri, dll.).
Ekstrak SETIAP baris transaksi yang ada pada gambar menjadi array JSON dengan format PERSIS berikut:
[
  {
    "date": "YYYY-MM-DD",
    "description": "Nama merchant / judul transaksi",
    "amount": 50000,
    "type": "expense" | "income" | "transfer",
    "categoryHint": "Food & Beverage / Transport / etc."
  }
]
Aturan:
- amount HARUS berupa angka murni tanpa titik/koma/simbol Rupiah.
- type: jika ada tanda minus (-) atau bayar/beli/QRIS -> "expense". Jika ada tanda plus (+) atau top up/cashback/masuk -> "income". Jika transfer ke rekening -> "transfer".
- tanggal: jika tidak ada tahun, gunakan tahun ${new Date().getFullYear()}. Format YYYY-MM-DD.
HANYA kembalikan array JSON murni tanpa markdown, tanpa backtick, tanpa kata pengantar.`;

  let responseJsonText = '';

  // Google Gemini API call
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const geminiPayload = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: imageBlob.type || 'image/jpeg',
              data: base64Data,
            },
          },
        ],
      },
    ],
  };

  const res = await fetchFn(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(geminiPayload),
  });

  if (!res.ok) {
    throw new Error(`Gemini Vision API error HTTP ${res.status}: ${res.statusText}`);
  }

  const json = await res.json();
  responseJsonText = json.candidates?.[0]?.content?.parts?.[0]?.text || '';

  // Clean JSON
  const cleaned = responseJsonText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const parsedArray: any[] = JSON.parse(cleaned);
  if (!Array.isArray(parsedArray)) return null;

  const rows: HistoryRowParsedItem[] = [];

  for (const item of parsedArray) {
    const rawAmt = typeof item.amount === 'number' ? item.amount : parseCurrencyAmount(String(item.amount));
    if (rawAmt <= 0) continue;

    const txType: TransactionType =
      item.type === 'income' || item.type === 'transfer' ? item.type : 'expense';

    const cat = suggestCategoryForDescription(item.description || '', txType, categories);

    rows.push({
      id: 'row_' + crypto.randomUUID().slice(0, 8),
      sourceImageHash: imageHash,
      date: item.date || new Date().toISOString().split('T')[0],
      description: item.description || 'Transaksi',
      amount: rawAmt,
      type: txType,
      currency: matchedAccount.currency || baseCurrency,
      suggestedAccountId: matchedAccount.id,
      suggestedAccountName: matchedAccount.name,
      suggestedCategoryId: cat.id,
      suggestedCategoryName: cat.name,
      isDuplicate: false,
      confidence: 96,
      selected: true,
    });
  }

  await markDuplicatesAgainstLedger(rows);
  return rows;
}

/**
 * Cross-checks rows against existing ledger transactions in Dexie to flag duplicates
 */
async function markDuplicatesAgainstLedger(rows: HistoryRowParsedItem[]): Promise<void> {
  const existingTxs = await db.transactions.toArray();

  for (const row of rows) {
    const duplicate = existingTxs.find((t) => {
      if (t.isDeleted) return false;
      if (t.amount !== row.amount) return false;
      if (t.date !== row.date) return false;

      // Check text similarity
      const tDesc = (t.description || '').toLowerCase();
      const rDesc = (row.description || '').toLowerCase();
      return tDesc.includes(rDesc) || rDesc.includes(tDesc);
    });

    if (duplicate) {
      row.isDuplicate = true;
      row.duplicateReason = `Ditemukan transaksi sama (${duplicate.amount.toLocaleString()} pada ${duplicate.date}: "${duplicate.description}")`;
      row.selected = false; // Deselect duplicate by default for user safety
    }
  }
}

/**
 * Scan history screenshot file using AI or Tesseract fallback
 */
export async function scanHistoryScreenshot(
  imageFile: Blob,
  context: {
    accounts: Account[];
    categories: Category[];
    baseCurrency: CurrencyCode;
    settings?: AppSettings | null;
    masterPin?: string;
  },
  onProgress?: (progress: number, status: string) => void
): Promise<HistoryRowParsedItem[]> {
  const imageHash = await computeImageHash(imageFile);

  // 1. Try AI Vision first
  try {
    onProgress?.(30, 'Menganalisis baris transaksi dengan AI Vision...');
    const aiRows = await parseHistoryScreenshotWithAI(imageFile, context);
    if (aiRows && aiRows.length > 0) {
      onProgress?.(100, `Berhasil mendeteksi ${aiRows.length} transaksi!`);
      return aiRows;
    }
  } catch (aiErr) {
    console.warn('Bulk history AI Vision failed, falling back to local OCR:', aiErr);
  }

  // 2. Fallback to Local Tesseract OCR
  onProgress?.(45, 'Mempersiapkan gambar untuk OCR lokal...');
  const { processedBlob } = await preprocessReceiptImage(imageFile);

  onProgress?.(60, 'Membaca teks dari gambar (Tesseract.js)...');
  const { createWorker } = await import('tesseract.js');
  let worker: any = null;
  try {
    worker = await createWorker('ind+eng');
  } catch {
    worker = await createWorker('eng');
  }

  const ret = await worker.recognize(processedBlob);
  await worker.terminate();

  onProgress?.(85, 'Mengekstrak baris dan mencocokkan rekening...');
  const rows = await parseHistoryTextToRows(
    ret.data.text,
    imageHash,
    context.accounts,
    context.categories,
    context.baseCurrency
  );

  onProgress?.(100, `Pemindaian selesai: ${rows.length} transaksi ditemukan`);
  return rows;
}
