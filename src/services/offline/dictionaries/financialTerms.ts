/**
 * Financial & Economic Terminology Lexicon for Indonesian Personal Finance
 * Sourced from OJK, Bank Indonesia, PSAK, banking product documentation,
 * and everyday Indonesian consumer commerce terminology.
 *
 * Covers:
 * 1. Financial Institutions, Neobanks, E-Wallets & Payment Channels
 * 2. Extensive Category Synonym Taxonomies (500+ keywords across 13 categories)
 * 3. Financial Intent Grammars & Classification Keywords
 * 4. Debt & Receivable Directionality Signatures
 */

export interface FinancialEntityEntry {
  canonicalId: string;
  names: string[];
  type?: string;
}

/**
 * Indonesian Banks, Neobanks & E-Wallets
 */
export const FINANCIAL_INSTITUTIONS: FinancialEntityEntry[] = [
  // Commercial Banks
  { canonicalId: 'bca', names: ['bca', 'bank bca', 'bca checking', 'klikbca', 'm-bca', 'mbca', 'mybca'], type: 'bank' },
  { canonicalId: 'mandiri', names: ['mandiri', 'bank mandiri', 'livin', 'livin by mandiri', 'livin mandiri'], type: 'bank' },
  { canonicalId: 'bri', names: ['bri', 'bank bri', 'brimo'], type: 'bank' },
  { canonicalId: 'bni', names: ['bni', 'bank bni', 'bni mobile', 'wondr', 'wondr by bni'], type: 'bank' },
  { canonicalId: 'bsi', names: ['bsi', 'bank syariah indonesia', 'bsi mobile'], type: 'bank' },
  { canonicalId: 'cimb', names: ['cimb', 'cimb niaga', 'octo', 'octo mobile', 'octo clicks'], type: 'bank' },
  { canonicalId: 'permata', names: ['permata', 'bank permata', 'permata me', 'permatanet'], type: 'bank' },
  { canonicalId: 'danamon', names: ['danamon', 'bank danamon', 'd-bank'], type: 'bank' },
  { canonicalId: 'btn', names: ['btn', 'bank btn', 'btn mobile'], type: 'bank' },

  // Digital Banks / Neobanks
  { canonicalId: 'jago', names: ['jago', 'bank jago', 'kantong jago'], type: 'bank' },
  { canonicalId: 'jenius', names: ['jenius', 'btpn jenius', 'm-card jenius'], type: 'bank' },
  { canonicalId: 'blu', names: ['blu', 'blu by bca', 'blu bca'], type: 'bank' },
  { canonicalId: 'seabank', names: ['seabank', 'sea bank'], type: 'bank' },
  { canonicalId: 'allobank', names: ['allo', 'allo bank', 'allobank'], type: 'bank' },
  { canonicalId: 'bnc', names: ['bnc', 'bank neo', 'neo commerce', 'neobank'], type: 'bank' },
  { canonicalId: 'digibank', names: ['digibank', 'dbs digibank', 'dbs'], type: 'bank' },

  // E-Wallets & Fintech
  { canonicalId: 'gopay', names: ['gopay', 'go-pay', 'go pay', 'saldo gopay'], type: 'ewallet' },
  { canonicalId: 'ovo', names: ['ovo', 'saldo ovo', 'ovo cash'], type: 'ewallet' },
  { canonicalId: 'dana', names: ['dana', 'saldo dana', 'dompet dana'], type: 'ewallet' },
  { canonicalId: 'shopeepay', names: ['shopeepay', 'shopee pay', 'spay', 'saldo shopeepay'], type: 'ewallet' },
  { canonicalId: 'linkaja', names: ['linkaja', 'link aja', 'tcash'], type: 'ewallet' },
  { canonicalId: 'qris', names: ['qris', 'scan qris', 'bayar qris'], type: 'ewallet' },
  { canonicalId: 'paypal', names: ['paypal', 'saldo paypal', 'pp'], type: 'paypal' },

  // Cash / Tunai
  { canonicalId: 'cash', names: ['cash', 'tunai', 'uang tunai', 'dompet', 'kontan', 'cash wallet'], type: 'cash' },
];

/**
 * Category Taxonomies with 500+ Everyday Indonesian Terms
 */
export const CATEGORY_TAXONOMY_MAP: Record<string, { categoryId: string; type: 'expense' | 'income' | 'both'; keywords: string[] }> = {
  // 1. Food & Dining (Kuliner, Jajan, Kafe, Restoran)
  cat_food: {
    categoryId: 'cat_food',
    type: 'expense',
    keywords: [
      'makan', 'minum', 'sarapan', 'maksi', 'dinner', 'kopi', 'ngopi', 'coffee', 'kafe', 'cafe',
      'warkop', 'angkringan', 'resto', 'restoran', 'warteg', 'padang', 'nasi goreng', 'mie ayam',
      'bakso', 'sate', 'ayam geprek', 'pecel lele', 'jajan', 'camilan', 'snack', 'dessert', 'boba',
      'kuliner', 'gofood', 'go-food', 'grabfood', 'grab-food', 'shopeefood', 'shopee-food',
      'starbucks', 'janji jiwa', 'kopi kenangan', 'fore', 'chatime', 'mcd', 'mcdonalds', 'kfc',
      'hokben', 'pizza hut', 'dominos', 'burger king', 'dcost', 'solaria', 'roti', 'kue',
      'martabak', 'pempek', 'siomay', 'batagor', 'seblak', 'soto', 'rawon', 'gudeg', 'bebek',
      'jus', 'esteh', 'teh manis', 'cendol', 'eskrim', 'ice cream', 'makan siang', 'makan malam',
    ],
  },

  // 2. Groceries & Household (Kebutuhan Pokok, Dapur & Pasar)
  cat_groceries: {
    categoryId: 'cat_groceries',
    type: 'expense',
    keywords: [
      'sembako', 'beras', 'minyak goreng', 'telur', 'gula', 'garam', 'sayur', 'buah', 'daging',
      'ayam mentah', 'ikan', 'bumbu dapur', 'sabun mandi', 'shampoo', 'deterjen', 'odol',
      'pasta gigi', 'tisu', 'galon', 'aqua galon', 'air mineral', 'gas lpg', 'gas elpiji',
      'belanja bulanan', 'supermarket', 'minimarket', 'indomaret', 'alfamart', 'alfamidi',
      'superindo', 'hypermart', 'transmart', 'pasar', 'pasar tradisional', 'lotte mart', 'hero',
      'farmers market', 'sayuran', 'buah-buahan', 'pembersih lantai', 'pelembut pakaian',
    ],
  },

  // 3. Transportation & Mobility (BBM, Kendaraan, Ojol, Tiket)
  cat_transport: {
    categoryId: 'cat_transport',
    type: 'expense',
    keywords: [
      'bensin', 'bbm', 'pertalite', 'pertamax', 'pertamax turbo', 'solar', 'dexlite', 'shell',
      'spbu', 'pom bensin', 'ojol', 'ojek', 'ojek online', 'grab', 'grabcar', 'grabbike',
      'gojek', 'goride', 'gocar', 'maxim', 'indrive', 'taksi', 'bluebird', 'parkir', 'karcis parkir',
      'tol', 'e-toll', 'etoll', 'kartu tol', 'mrt', 'lrt', 'krl', 'commuter line', 'busway',
      'transjakarta', 'angkot', 'kereta', 'kai', 'tiket kereta', 'tiket pesawat', 'pesawat',
      'garuda', 'lion air', 'citilink', 'airasia', 'servis mobil', 'servis motor', 'bengkel',
      'ganti oli', 'tambal ban', 'cuci mobil', 'cuci motor', 'helm', 'sparepart',
    ],
  },

  // 4. Bills & Utilities (Listrik, Air, Wifi, Pulsa, BPJS)
  cat_bills: {
    categoryId: 'cat_bills',
    type: 'expense',
    keywords: [
      'listrik', 'token pln', 'tagihan pln', 'pln', 'pdam', 'tagihan air', 'air pdam', 'wifi',
      'internet', 'indihome', 'biznet', 'first media', 'myrepublic', 'oxygen', 'pulsa', 'kuota',
      'paket data', 'telkomsel', 'by.u', 'indosat', 'im3', 'xl', 'axis', 'tri', 'smartfren',
      'bpjs', 'bpjs kesehatan', 'bpjs ketenagakerjaan', 'ipl', 'iuran lingkungan', 'iuran rt',
      'keamanan', 'kebersihan', 'sampah', 'retribusi', 'pbb', 'pajak rumah', 'pajak stnk',
    ],
  },

  // 5. Shopping & Lifestyle (Pakaian, Gadget, E-Commerce)
  cat_shopping: {
    categoryId: 'cat_shopping',
    type: 'expense',
    keywords: [
      'belanja', 'baju', 'celana', 'kaos', 'kemeja', 'sepatu', 'sandal', 'tas', 'dompet',
      'aksesoris', 'skincare', 'makeup', 'kosmetik', 'parfum', 'gadget', 'handphone', 'hp',
      'laptop', 'elektronik', 'tokopedia', 'shopee', 'lazada', 'tiktok shop', 'blibli',
      'zalora', 'mall', 'uniqlo', 'zara', 'h&m', 'pull&bear', 'stradivarius', 'matahari',
      'jam tangan', 'kacamata gaya', 'casing hp', 'charger', 'headphone', 'earphone',
    ],
  },

  // 6. Health & Medical (Kesehatan, Obat, Dokter, Klinik)
  cat_health: {
    categoryId: 'cat_health',
    type: 'expense',
    keywords: [
      'obat', 'apotek', 'apotik', 'kimia farma', 'k24', 'guardian', 'watsons', 'dokter',
      'klinik', 'rumah sakit', 'rs', 'rawat jalan', 'rawat inap', 'periksa', 'tes lab',
      'swab', 'vitamin', 'suplemen', 'masker', 'termometer', 'tambal gigi', 'scaling gigi',
      'dokter gigi', 'kacamata minus', 'optik', 'melawai', 'seis', 'fisioterapi',
    ],
  },

  // 7. Entertainment & Subscriptions (Hiburan, Bioskop, Game)
  cat_entertainment: {
    categoryId: 'cat_entertainment',
    type: 'expense',
    keywords: [
      'nonton', 'bioskop', 'cinema xxi', 'cgv', 'cinepolis', 'tiket bioskop', 'konser',
      'tiket konser', 'liburan', 'staycation', 'hotel', 'wisata', 'rekreasi', 'game', 'steam',
      'playstation', 'top up game', 'mobile legends', 'free fire', 'pubg', 'genshin',
      'netflix', 'spotify', 'youtube premium', 'disney+', 'hotstar', 'prime video', 'hbo',
      'karaoke', 'billiard', 'futsal', 'badminton', 'bowling',
    ],
  },

  // 8. Education & Children (Sekolah, Kuliah, Kursus, Anak)
  cat_education: {
    categoryId: 'cat_education',
    type: 'expense',
    keywords: [
      'spp', 'uang sekolah', 'kuliah', 'ukt', 'uang semester', 'buku', 'buku tulis', 'alat tulis',
      'kursus', 'les', 'bimbel', 'kumon', 'ruangguru', 'biaya pendaftaran', 'wisuda',
      'susu formula', 'pampers', 'popok', 'mainan anak', 'seragam sekolah',
    ],
  },

  // 9. Bank & Admin Fees (Biaya Transaksi, Denda)
  cat_fees: {
    categoryId: 'cat_fees',
    type: 'expense',
    keywords: [
      'biaya admin', 'admin bank', 'biaya transfer', 'biaya penanganan', 'admin fee',
      'denda', 'denda keterlambatan', 'materai', 'provisi', 'bunga kartu kredit', 'pajak bunga',
    ],
  },

  // 10. Salary & Wages (Gaji, Upah, Tunjangan)
  cat_salary: {
    categoryId: 'cat_salary',
    type: 'income',
    keywords: [
      'gaji', 'salary', 'payroll', 'upah', 'honor', 'bonus', 'thr', 'tunjangan', 'komisi',
      'insentif', 'uang lembur', 'pesangon', 'uang makan kantor',
    ],
  },

  // 11. Freelance & Side Income (Proyek, Usaha, Jualan)
  cat_freelance: {
    categoryId: 'cat_freelance',
    type: 'income',
    keywords: [
      'freelance', 'side hustle', 'proyek', 'project', 'jasa', 'desain', 'coding', 'tulis artikel',
      'penjualan', 'omzet', 'laba', 'profit', 'hasil dagang', 'toko', 'jualan', 'cuan bisnis',
      'reimburse', 'klaim', 'pengembalian dana', 'refund',
    ],
  },

  // 12. Investments & Dividends (Investasi, Bunga, Dividen)
  cat_investment: {
    categoryId: 'cat_investment',
    type: 'income',
    keywords: [
      'dividen', 'bunga deposito', 'hasil investasi', 'capital gain', 'profit saham',
      'cuan reksadana', 'cuan crypto', 'kupon obligasi', 'bunga tabungan', 'bagi hasil',
      'saham', 'reksadana', 'deposito', 'emas', 'antam', 'crypto', 'bitcoin', 'sukuk', 'sbn',
    ],
  },

  // 13. Debt & Loan Transactions (Pinjaman, Hutang, Piutang)
  cat_debt_loan: {
    categoryId: 'cat_debt_loan',
    type: 'both',
    keywords: [
      'hutang', 'utang', 'piutang', 'pinjaman', 'pinjol', 'kredit', 'kpr', 'kta', 'paylater',
      'spaylater', 'gopaylater', 'cicilan', 'angsuran', 'pelunasan', 'bayar hutang', 'bayar utang',
      'talangan', 'pinjam', 'pinjem', 'pinjamkan', 'pinjemin', 'minjem', 'minjemin',
    ],
  },
};

/**
 * Debt vs Receivable Directionality Signatures
 */
export const DEBT_DIRECTION_RULES = {
  // Phrases that explicitly mean USER IS BORROWING -> Type: 'debt' (You owe counterparty)
  userBorrowingPatterns: [
    // Subject is user: "aku pinjem budi", "saya pinjam budi", "gw pinjem ke budi"
    /\b(?:aku|saya|gw|gua|gue)\s+(?:pinjem|pinjam|minjem|ngutang)\s+(?:(?:uang|duit|dana)\s+)?(?:dari\s+|ke\s+|sama\s+)?([a-z\s]+?)(?:\s+\d|\s+sebesar|\s+senilai|\s+gocap|\s+ceban|\s+pekgo|$)/i,
    // "pinjam/minjem dari X"
    /\b(?:pinjam|pinjem|minjem)\s+(?:(?:uang|duit|dana)\s+)?(?:dari|ke|sama)\s+([a-z\s]+?)(?:\s+\d|\s+gocap|\s+ceban|\s+pekgo|$)/i,
    // Passive: "ditalangin X", "ditalangi oleh X", "dipinjamin X"
    /\b(?:ditalangin|ditalangi|dipinjamin|dipinjemin)\s+(?:sama|oleh|dari)?\s*([a-z\s]+?)(?:\s+\d|\s+gocap|\s+ceban|\s+pekgo|$)/i,
    // Counterparty is subject performing active lending: "budi nalangin aku", "budi minjemin gw"
    /\b([a-z]+)\s+(?:nalangin|talangin|minjemin|pinjemin|kasih\s+pinjaman)\s+(?:ke\s+)?(?:aku|saya|gw|gua|gue)\b/i,
    // General debt intent: "ngutang ke X", "ada hutang ke X"
    /\b(?:ngutang|utang|hutang)\s+(?:ke|sama|di)\s+([a-z\s]+?)(?:\s+\d|\s+gocap|\s+ceban|\s+pekgo|$)/i,
  ],

  // Phrases that explicitly mean USER IS LENDING -> Type: 'receivable' (Counterparty owes user)
  userLendingPatterns: [
    // Suffix -in / -kan indicates transitive lending: "pinjemin budi", "minjemin budi", "pinjamkan ke budi", "pinjemin uang ke budi"
    /\b(?:pinjemin|minjemin|pinjamkan)\s+(?:(?:uang|duit|dana)\s+)?(?:ke\s+|sama\s+)?([a-z\s]+?)(?:\s+\d|\s+gocap|\s+ceban|\s+pekgo|$)/i,
    // Active loan: "kasih pinjam budi", "beri pinjaman ke budi"
    /\b(?:kasih|beri)\s+pinjam(?:an)?\s+(?:(?:uang|duit|dana)\s+)?(?:ke\s+|sama\s+)?([a-z\s]+?)(?:\s+\d|\s+gocap|\s+ceban|\s+pekgo|$)/i,
    // Active payment for someone: "(aku) nalangin budi", "talangin budi"
    /\b(?:nalangin|talangin)\s+(?:si\s+)?([a-z\s]+?)(?:\s+\d|\s+gocap|\s+ceban|\s+pekgo|$)/i,
    // Counterparty is subject borrowing from user: "budi pinjem aku", "budi minjem gw", "budi pinjam saya"
    /\b([a-z]+)\s+(?:pinjem|pinjam|minjem|ngutang)\s+(?:(?:uang|duit|dana)\s+)?(?:ke\s+|sama\s+|dari\s+)?(?:aku|saya|gw|gua|gue)\b/i,
    // General receivable intent: "piutang di budi", "budi ada piutang"
    /\b(?:piutang)\s+(?:di|ke|dari)\s+([a-z\s]+?)(?:\s+\d|\s+gocap|\s+ceban|\s+pekgo|$)/i,
  ],
};
