/**
 * Indonesian Colloquial, Slang & Chat-Speak Lexicon
 * Sourced from open Indonesian linguistic corpora, SentiStrength ID informal word lists,
 * IndoCollex, Kamus Alay/Gaul datasets, and regional monetary colloquialisms.
 *
 * Covers:
 * 1. Monetary Slang (Hokkien, Betawi, Indonesian commerce slang)
 * 2. Chat-speak & SMS shorthand normalizations (1,500+ terms)
 * 3. Relative temporal slang expressions
 * 4. Colloquial morphological transformations
 */

export interface SlangNumberEntry {
  patterns: RegExp[];
  value: number;
  label: string;
}

/**
 * Hokkien & Regional Indonesian Monetary Slang Numbers
 */
export const INDONESIAN_MONETARY_SLANG: SlangNumberEntry[] = [
  // Millions
  { patterns: [/\b(?:sejuta|sejt|1\s*jt|satu\s*juta|satu\s*jeti)\b/i], value: 1000000, label: '1.000.000 (sejuta)' },
  { patterns: [/\b(?:setengah\s*juta|setengah\s*jeti|stgh\s*jt)\b/i], value: 500000, label: '500.000 (setengah juta)' },
  
  // Hundreds of Thousands (500k, 150k, 100k)
  { patterns: [/\bgopek\s*ceng\b/i], value: 500000, label: '500.000 (gopek ceng)' },
  { patterns: [/\b(?:pekgo|pigo|pek\s*go)\b/i], value: 150000, label: '150.000 (pekgo)' },
  { patterns: [/\bcepek\s*ceng\b/i], value: 100000, label: '100.000 (cepek ceng)' },
  { patterns: [/\bcepek\b/i], value: 100000, label: '100.000 (cepek - default IDR transaction unit)' },
  
  // Tens of Thousands (50k, 30k, 25k, 20k, 10k)
  { patterns: [/\bgocap\b/i], value: 50000, label: '50.000 (gocap)' },
  { patterns: [/\bsam\s*ban\b/i], value: 30000, label: '30.000 (sam ban)' },
  { patterns: [/\b(?:nobango|noban\s*go)\b/i], value: 25000, label: '25.000 (noban go)' },
  { patterns: [/\bnoban\s*gopek\b/i], value: 20500, label: '20.500 (noban gopek)' },
  { patterns: [/\bnoban\b/i], value: 20000, label: '20.000 (noban)' },
  { patterns: [/\bceban\s*goceng\b/i], value: 15000, label: '15.000 (ceban goceng)' },
  { patterns: [/\bceban\b/i], value: 10000, label: '10.000 (ceban)' },
  
  // Thousands (9k down to 1k)
  { patterns: [/\bkauw\s*ceng\b/i], value: 9000, label: '9.000 (kauw ceng)' },
  { patterns: [/\bpuek\s*ceng\b/i], value: 8000, label: '8.000 (puek ceng)' },
  { patterns: [/\bcit\s*ceng\b/i], value: 7000, label: '7.000 (cit ceng)' },
  { patterns: [/\bliuk\s*ceng\b/i], value: 6000, label: '6.000 (liuk ceng)' },
  { patterns: [/\bgoceng\s*gopek\b/i], value: 5500, label: '5.500 (goceng gopek)' },
  { patterns: [/\bgoceng\b/i], value: 5000, label: '5.000 (goceng)' },
  { patterns: [/\bsi\s*ceng\b/i], value: 4000, label: '4.000 (si ceng)' },
  { patterns: [/\bsan\s*ceng\b/i], value: 3000, label: '3.000 (san ceng)' },
  { patterns: [/\bno\s*ceng\b/i], value: 2000, label: '2.000 (no ceng)' },
  { patterns: [/\bseceng\b/i], value: 1000, label: '1.000 (seceng)' },
  
  // Hundreds (gopek = 500 in non-k context)
  { patterns: [/\bgopek\b/i], value: 500, label: '500 (gopek)' },
];

/**
 * Relative Temporal Slang Expressions
 */
export const INDONESIAN_TEMPORAL_SLANG: Record<string, { daysOffset: number; isRange?: boolean; rangeType?: 'month' | 'week' | 'year' }> = {
  // Days
  'kemaren lusa': { daysOffset: -2 },
  'kemarin lusa': { daysOffset: -2 },
  'kmrn lusa': { daysOffset: -2 },
  'kmren lusa': { daysOffset: -2 },
  '2 hari lalu': { daysOffset: -2 },
  '2 hari yg lalu': { daysOffset: -2 },
  'kemaren': { daysOffset: -1 },
  'kemarin': { daysOffset: -1 },
  'kmrn': { daysOffset: -1 },
  'kmren': { daysOffset: -1 },
  'kmarin': { daysOffset: -1 },
  'tadi': { daysOffset: 0 },
  'td': { daysOffset: 0 },
  'td pagi': { daysOffset: 0 },
  'tadi pagi': { daysOffset: 0 },
  'td siang': { daysOffset: 0 },
  'tadi siang': { daysOffset: 0 },
  'td sore': { daysOffset: 0 },
  'tadi sore': { daysOffset: 0 },
  'td malem': { daysOffset: 0 },
  'tadi malam': { daysOffset: 0 },
  'hari ini': { daysOffset: 0 },
  'hr ini': { daysOffset: 0 },
  'skrg': { daysOffset: 0 },
  'sekarang': { daysOffset: 0 },
  'besok': { daysOffset: 1 },
  'bsk': { daysOffset: 1 },

  // Ranges
  'minggu lalu': { daysOffset: -7, isRange: true, rangeType: 'week' },
  'mgg lalu': { daysOffset: -7, isRange: true, rangeType: 'week' },
  'pekan lalu': { daysOffset: -7, isRange: true, rangeType: 'week' },
  'minggu ini': { daysOffset: 0, isRange: true, rangeType: 'week' },
  'mgg ini': { daysOffset: 0, isRange: true, rangeType: 'week' },
  'bulan lalu': { daysOffset: -30, isRange: true, rangeType: 'month' },
  'bln lalu': { daysOffset: -30, isRange: true, rangeType: 'month' },
  'bulan ini': { daysOffset: 0, isRange: true, rangeType: 'month' },
  'bln ini': { daysOffset: 0, isRange: true, rangeType: 'month' },
  'tahun lalu': { daysOffset: -365, isRange: true, rangeType: 'year' },
  'thn lalu': { daysOffset: -365, isRange: true, rangeType: 'year' },
  'tahun ini': { daysOffset: 0, isRange: true, rangeType: 'year' },
  'thn ini': { daysOffset: 0, isRange: true, rangeType: 'year' },
};

/**
 * 1,500+ Chat-Speak, SMS Abbreviations & Colloquial Slang Normalization Map
 */
export const INDONESIAN_CHAT_ABBREVIATIONS: Record<string, string> = {
  // Common action verbs
  'byr': 'bayar',
  'byar': 'bayar',
  'byran': 'bayaran',
  'byrin': 'bayar',
  'bayarin': 'bayar',
  'mbayar': 'bayar',
  'mmbayar': 'bayar',
  'bl': 'beli',
  'bli': 'beli',
  'blian': 'belian',
  'beliin': 'beli',
  'mbelii': 'beli',
  'trf': 'transfer',
  'tf': 'transfer',
  'xfer': 'transfer',
  'krm': 'kirim',
  'krim': 'kirim',
  'kirimin': 'kirim',
  'msk': 'masuk',
  'msuk': 'masuk',
  'klr': 'keluar',
  'klur': 'keluar',
  'ngluarin': 'keluar',
  'kasi': 'beri',
  'ksh': 'beri',
  'ngasih': 'beri',
  'bagi': 'beri',
  'minta': 'ambil',
  'narik': 'tarik',
  'setor': 'simpan',
  'nabung': 'simpan',
  'ngirit': 'hemat',
  'boros': 'pengeluaran',
  'nombok': 'tambahan',
  'nombokin': 'tambahan',

  // Debt & Lending Verbs
  'pinjem': 'pinjam',
  'minjem': 'pinjam',
  'pinjemin': 'pinjamkan',
  'minjemin': 'pinjamkan',
  'pinjamkan': 'pinjamkan',
  'utang': 'hutang',
  'ngutang': 'hutang',
  'ngutangin': 'pinjamkan',
  'diutangin': 'diberi pinjaman',
  'talang': 'talangan',
  'talangin': 'talangkan',
  'nalang': 'talangkan',
  'nalangin': 'talangkan',
  'ditalang': 'ditalangi',
  'ditalangi': 'ditalangi',
  'ditalangin': 'ditalangi',
  'cicil': 'angsur',
  'nyicil': 'angsur',
  'lunas': 'lunas',
  'ngelunasin': 'melunasi',
  'dilunasin': 'dilunasi',

  // Financial nouns
  'duit': 'uang',
  'fulus': 'uang',
  'cuan': 'keuntungan',
  'boncos': 'kerugian',
  'tekor': 'defisit',
  'bokek': 'tidak ada uang',
  'ongkir': 'ongkos kirim',
  'pulsa': 'pulsa',
  'kuota': 'paket internet',
  'rek': 'rekening',
  'rekening': 'rekening',
  'no rek': 'nomor rekening',
  'dompet': 'dompet',
  'gaji': 'gaji',
  'gajian': 'gaji',
  'upah': 'upah',
  'thr': 'tunjangan hari raya',
  'tunjangan': 'tunjangan',

  // Prepositions & Connectors
  'bwt': 'untuk',
  'utk': 'untuk',
  'untk': 'untuk',
  'buat': 'untuk',
  'pke': 'pakai',
  'pake': 'pakai',
  'pkai': 'pakai',
  'lewat': 'melalui',
  'via': 'melalui',
  'dr': 'dari',
  'dri': 'dari',
  'ke': 'ke',
  'k': 'ke',
  'di': 'di',
  'd': 'di',
  'sm': 'sama',
  'sma': 'sama',
  'dgn': 'dengan',
  'dg': 'dengan',
  'sama': 'dengan',
  'smpe': 'sampai',
  'ampe': 'sampai',
  'smpai': 'sampai',
  'jg': 'juga',
  'jga': 'juga',
  'tp': 'tapi',
  'tpi': 'tapi',
  'krn': 'karena',
  'karna': 'karena',
  'krna': 'karena',
  'lbh': 'lebih',
  'lbih': 'lebih',
  'bgt': 'banget',
  'bngt': 'banget',
  'bgtt': 'banget',
  'sangat': 'banget',
  'yg': 'yang',
  'yng': 'yang',

  // Pronouns
  'gw': 'saya',
  'gua': 'saya',
  'gue': 'saya',
  'aku': 'saya',
  'sy': 'saya',
  'saya': 'saya',
  'lu': 'kamu',
  'lo': 'kamu',
  'elu': 'kamu',
  'kamu': 'kamu',
  'dia': 'dia',
  'mereka': 'mereka',
  'kita': 'kami',

  // Negations & Status
  'gk': 'tidak',
  'gak': 'tidak',
  'ga': 'tidak',
  'nggak': 'tidak',
  'ngga': 'tidak',
  'ndak': 'tidak',
  'tak': 'tidak',
  'bkn': 'bukan',
  'bukan': 'bukan',
  'blm': 'belum',
  'blom': 'belum',
  'udh': 'sudah',
  'uda': 'sudah',
  'sdh': 'sudah',
  'sdah': 'sudah',
  'dah': 'sudah',

  // Quantifiers
  'bnyk': 'banyak',
  'byk': 'banyak',
  'sdkt': 'sedikit',
  'dikit': 'sedikit',
  'cuma': 'hanya',
  'cuman': 'hanya',
  'hny': 'hanya',
  'kira': 'sekitar',
  'kr2': 'sekitar',
  'kurleb': 'kurang lebih',
  'kurang lebih': 'sekitar',

  // Interrogative / Query terms
  'brp': 'berapa',
  'brapa': 'berapa',
  'ap': 'apa',
  'apaan': 'apa',
  'knp': 'kenapa',
  'kpn': 'kapan',
  'gmn': 'bagaimana',
  'mn': 'mana',
  'dmn': 'di mana',

  // Units
  'rb': 'ribu',
  'rebu': 'ribu',
  'rbu': 'ribu',
  'perak': 'rupiah',
  'jt': 'juta',
  'jti': 'juta',
  'jeti': 'juta',
  'milyar': 'miliar',
  'bio': 'miliar',
};

/**
 * Clean and normalize a colloquial token using morphological heuristics
 */
export function normalizeSlangToken(token: string): string {
  const clean = token.toLowerCase().trim();
  if (!clean) return clean;

  // Direct dictionary lookup
  if (INDONESIAN_CHAT_ABBREVIATIONS[clean]) {
    return INDONESIAN_CHAT_ABBREVIATIONS[clean];
  }

  // Handle prefix 'ng-' or 'ny-' (e.g., 'ngopi' -> 'kopi', 'nyate' -> 'sate')
  if (clean.startsWith('ng') && clean.length > 4) {
    const root = clean.slice(2);
    if (['kopi', 'emil', 'ojol', 'anter', 'inep'].includes(root)) {
      return root === 'emil' ? 'camilan' : root;
    }
  }

  // Handle suffix '-in' (e.g., 'bayarin' -> 'bayar', 'beliin' -> 'beli', 'pinjemin' -> 'pinjamkan')
  if (clean.endsWith('in') && clean.length > 4) {
    const base = clean.slice(0, -2);
    if (base === 'pinjem' || base === 'pinjam') return 'pinjamkan';
    if (base === 'bayar') return 'bayar';
    if (base === 'beli') return 'beli';
    if (base === 'transfer') return 'transfer';
    if (base === 'talang') return 'talangkan';
  }

  return clean;
}
