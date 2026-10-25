/**
 * Lazy-Loaded Dictionaries Index
 * Provides on-demand async access to Indonesian Colloquial & Financial Reference Lexicons.
 */

import {
  INDONESIAN_MONETARY_SLANG,
  INDONESIAN_TEMPORAL_SLANG,
  INDONESIAN_CHAT_ABBREVIATIONS,
  normalizeSlangToken,
} from './indonesianSlang';

import {
  FINANCIAL_INSTITUTIONS,
  CATEGORY_TAXONOMY_MAP,
  DEBT_DIRECTION_RULES,
} from './financialTerms';

export interface OfflineDictionaries {
  monetarySlang: typeof INDONESIAN_MONETARY_SLANG;
  temporalSlang: typeof INDONESIAN_TEMPORAL_SLANG;
  abbreviations: typeof INDONESIAN_CHAT_ABBREVIATIONS;
  institutions: typeof FINANCIAL_INSTITUTIONS;
  categories: typeof CATEGORY_TAXONOMY_MAP;
  debtDirectionRules: typeof DEBT_DIRECTION_RULES;
  normalizeSlangToken: typeof normalizeSlangToken;
}

let cachedDictionaries: OfflineDictionaries | null = null;

/**
 * Asynchronously load the offline dictionaries.
 * When called via dynamic import, this isolates all vocabulary into a separate chunk.
 */
export async function getOfflineDictionaries(): Promise<OfflineDictionaries> {
  if (cachedDictionaries) {
    return cachedDictionaries;
  }

  cachedDictionaries = {
    monetarySlang: INDONESIAN_MONETARY_SLANG,
    temporalSlang: INDONESIAN_TEMPORAL_SLANG,
    abbreviations: INDONESIAN_CHAT_ABBREVIATIONS,
    institutions: FINANCIAL_INSTITUTIONS,
    categories: CATEGORY_TAXONOMY_MAP,
    debtDirectionRules: DEBT_DIRECTION_RULES,
    normalizeSlangToken,
  };

  return cachedDictionaries;
}
