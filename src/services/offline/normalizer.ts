/**
 * Morphology & Normalization Pipeline for Offline Intelligence
 * Performs tokenization, chat-speak abbreviation expansion,
 * monetary slang number extraction, temporal date resolution,
 * and syntactical debt-vs-receivable directionality classification.
 */

import type { OfflineDictionaries } from './dictionaries';
import type { Account, Category, CurrencyCode } from '../../types';

export interface ExtractedEntities {
  normalizedText: string;
  amount?: number;
  currency: CurrencyCode;
  date: string;
  matchedAccount?: Account;
  matchedCategory?: Category;
  description: string;
  debtReceivableMeta?: {
    isDebtOrReceivable: boolean;
    type: 'debt' | 'receivable';
    counterpartyName: string;
    directionLabel: string;
    directionExplanation: string;
  };
}

/**
 * Stage 1 & 2: Tokenize, expand slang/abbreviations, and extract entities
 */
export function normalizeAndExtractEntities(
  rawText: string,
  accounts: Account[],
  categories: Category[],
  baseCurrency: CurrencyCode,
  dict: OfflineDictionaries
): ExtractedEntities {
  const cleanInput = rawText.trim().toLowerCase();

  // 1. Slang & Abbreviation Token Normalization
  const rawWords = cleanInput.split(/\s+/);
  const normalizedWords = rawWords.map((word) => dict.normalizeSlangToken(word));
  const normalizedText = normalizedWords.join(' ');

  // 2. Extract Relative or Explicit Date
  let targetDate = new Date().toISOString().split('T')[0];
  let matchedDateToken = '';
  for (const [phrase, config] of Object.entries(dict.temporalSlang)) {
    if (new RegExp(`\\b${phrase}\\b`, 'i').test(cleanInput) || new RegExp(`\\b${phrase}\\b`, 'i').test(normalizedText)) {
      const d = new Date();
      d.setDate(d.getDate() + config.daysOffset);
      targetDate = d.toISOString().split('T')[0];
      matchedDateToken = phrase;
      break;
    }
  }

  // 3. Extract Amount & Currency
  let amount = 0;
  let currency: CurrencyCode = baseCurrency;
  let matchedAmountToken = '';

  // 3a. Check Hokkien & Indonesian Monetary Slang Numbers First
  for (const item of dict.monetarySlang) {
    for (const pattern of item.patterns) {
      const match = cleanInput.match(pattern);
      if (match) {
        amount = item.value;
        matchedAmountToken = match[0];
        break;
      }
    }
    if (amount > 0) break;
  }

  // 3b. Check standard numeric formats with multipliers (k, rb, jt, m, etc.)
  if (!amount) {
    const numMatch = cleanInput.match(
      /(?:sebesar|senilai|rp\.?|idr)?\s*(\d+(?:[.,]\d+)?)(?:\s*(k|rb|ribu|jt|juta|m|usd|idr|sgd)\b)?/i
    );
    if (numMatch && numMatch[1]) {
      amount = parseFloat(numMatch[1].replace(',', '.'));
      matchedAmountToken = numMatch[0];
      const unit = numMatch[2]?.toLowerCase();
      if (unit === 'k' || unit === 'rb' || unit === 'ribu') {
        amount *= 1000;
      } else if (unit === 'jt' || unit === 'juta' || unit === 'm') {
        amount *= 1000000;
      }
    }
  }

  // Check currency override (USD, SGD, EUR)
  if (/\b(?:usd|\$|dollar)\b/i.test(cleanInput)) currency = 'USD';
  else if (/\b(?:sgd|singapore\s*dollar)\b/i.test(cleanInput)) currency = 'SGD';
  else if (/\b(?:eur|euro)\b/i.test(cleanInput)) currency = 'EUR';

  // 4. Syntactic Debt vs Receivable Directionality Disambiguation
  let debtReceivableMeta: ExtractedEntities['debtReceivableMeta'];
  
  // Check User Lending (Receivable -> Person owes User)
  for (const pattern of dict.debtDirectionRules.userLendingPatterns) {
    const match = cleanInput.match(pattern);
    if (match && match[1]) {
      let person = match[1].replace(/^(?:uang|duit|dana)\s+(?:ke\s+|sama\s+|dari\s+)?/i, '').trim();
      person = person.replace(/\b(?:ke|sama|dari)\s+/i, '').trim();
      if (person && !['aku', 'saya', 'gw', 'gua', 'gue'].includes(person)) {
        debtReceivableMeta = {
          isDebtOrReceivable: true,
          type: 'receivable',
          counterpartyName: capitalize(person),
          directionLabel: `🤝 YOU ARE LENDING TO ${capitalize(person)}`,
          directionExplanation: `${capitalize(person)} OWES YOU ${amount ? amount.toLocaleString() + ' ' + currency : ''}. This will be logged as an incoming receivable asset to be collected.`,
        };
        break;
      }
    }
  }

  // Check User Borrowing (Debt -> User owes Counterparty)
  if (!debtReceivableMeta) {
    for (const pattern of dict.debtDirectionRules.userBorrowingPatterns) {
      const match = cleanInput.match(pattern);
      if (match && match[1]) {
        let person = match[1].replace(/^(?:uang|duit|dana)\s+(?:ke\s+|sama\s+|dari\s+)?/i, '').trim();
        person = person.replace(/\b(?:ke|sama|dari)\s+/i, '').trim();
        if (person && !['aku', 'saya', 'gw', 'gua', 'gue'].includes(person)) {
          debtReceivableMeta = {
            isDebtOrReceivable: true,
            type: 'debt',
            counterpartyName: capitalize(person),
            directionLabel: `💳 YOU BORROWED FROM ${capitalize(person)}`,
            directionExplanation: `YOU OWE ${capitalize(person)} ${amount ? amount.toLocaleString() + ' ' + currency : ''}. This will be logged as an outstanding debt liability to repay.`,
          };
          break;
        }
      }
    }
  }

  // 5. Account Resolution
  let matchedAccount: Account | undefined;
  // Match by user's exact account names first
  for (const acc of accounts) {
    if (cleanInput.includes(acc.name.toLowerCase())) {
      matchedAccount = acc;
      break;
    }
  }

  // Match by institutional synonyms
  if (!matchedAccount) {
    for (const inst of dict.institutions) {
      if (inst.names.some((n) => new RegExp(`\\b${n}\\b`, 'i').test(cleanInput))) {
        // Find user account matching this entity type or name
        matchedAccount =
          accounts.find((a) => a.name.toLowerCase().includes(inst.canonicalId)) ||
          accounts.find((a) => a.type === inst.type);
        if (matchedAccount) break;
      }
    }
  }
  if (!matchedAccount) matchedAccount = accounts[0];

  // 6. Category Resolution
  let matchedCategory: Category | undefined;
  if (debtReceivableMeta?.isDebtOrReceivable) {
    matchedCategory = categories.find((c) => c.id === 'cat_debt_loan');
  } else {
    // Scan all category taxonomies for matches
    let highestScore = 0;
    for (const [catId, tax] of Object.entries(dict.categories)) {
      let score = 0;
      for (const kw of tax.keywords) {
        if (new RegExp(`\\b${kw}\\b`, 'i').test(cleanInput) || new RegExp(`\\b${kw}\\b`, 'i').test(normalizedText)) {
          score += kw.length; // Longer keyword match has higher confidence
        }
      }
      if (score > highestScore) {
        highestScore = score;
        matchedCategory = categories.find((c) => c.id === catId);
      }
    }
  }
  if (!matchedCategory) {
    matchedCategory = categories[0];
  }

  // 7. Clean Description
  let desc = cleanInput;
  if (matchedAmountToken) desc = desc.replace(matchedAmountToken, ' ');
  if (matchedDateToken) desc = desc.replace(new RegExp(`\\b${matchedDateToken}\\b`, 'gi'), ' ');
  if (matchedAccount) desc = desc.replace(new RegExp(`\\b${matchedAccount.name.toLowerCase()}\\b`, 'gi'), ' ');

  // Strip financial and direction stopwords
  desc = desc
    .replace(/\b(bca|mandiri|bri|bni|cash|tunai|gopay|ovo|dana|shopeepay|paypal)\b/gi, ' ')
    .replace(/\b(di|ke|via|pake|pakai|using|with|dari|from|melalui|lewat|rek|rekening)\b/gi, ' ')
    .replace(/\b(sebesar|senilai|rp\.?|idr|duit|uang)\b/gi, ' ')
    .replace(/\b(masuk|keluar)\b/gi, ' ')
    .replace(/\b(membayar|bayar|beli|membeli|transfer|kirim)\b/gi, ' ')
    .replace(/\b(pinjam|pinjem|minjem|pinjamkan|pinjemin|minjemin|talangin|ditalangin|ngutang)\b/gi, ' ')
    .replace(/\b(aku|saya|gw|gua|gue)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!desc) {
    if (debtReceivableMeta?.isDebtOrReceivable) {
      desc = `${debtReceivableMeta.type === 'debt' ? 'Pinjaman dari' : 'Pinjaman ke'} ${debtReceivableMeta.counterpartyName}`;
    } else {
      desc = matchedCategory?.name || 'Transaction';
    }
  } else {
    desc = capitalize(desc);
  }

  return {
    normalizedText,
    amount: amount > 0 ? amount : undefined,
    currency,
    date: targetDate,
    matchedAccount,
    matchedCategory,
    description: desc,
    debtReceivableMeta,
  };
}

function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}
