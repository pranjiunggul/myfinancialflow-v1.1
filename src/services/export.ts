import type {
  Transaction,
  Account,
  Category,
  DebtReceivable,
  CurrencyCode,
} from '../types';
import { formatCurrency } from './fx';

// Helper: Escape CSV fields
function escapeCSV(val: any): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generate CSV text for transactions
 */
export function exportTransactionsToCSV(
  transactions: Transaction[],
  accounts: Account[],
  categories: Category[],
  baseCurrency: CurrencyCode
): string {
  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

  const headers = [
    'Date',
    'Time',
    'Type',
    'Description',
    'Amount',
    'Currency',
    'ExchangeRateToBase',
    `BaseAmount(${baseCurrency})`,
    'Account',
    'Category',
    'TransferToAccount',
    'TransferFee',
    'Tags',
    'TaxTreatment',
    'GrossAmount',
    'TaxWithheldAmount',
    'TaxSourceLabel',
  ];

  const rows = transactions.map((tx) => {
    const toAccName = tx.transferMeta?.toAccountId ? accountMap.get(tx.transferMeta.toAccountId) || '' : '';
    const fee = tx.transferMeta?.feeAmount || '';

    return [
      escapeCSV(tx.date),
      escapeCSV(tx.time || ''),
      escapeCSV(tx.type),
      escapeCSV(tx.description),
      escapeCSV(tx.amount),
      escapeCSV(tx.currency),
      escapeCSV(tx.exchangeRateToBase),
      escapeCSV(tx.baseAmount),
      escapeCSV(accountMap.get(tx.accountId) || 'Unknown Account'),
      escapeCSV(categoryMap.get(tx.categoryId) || 'Uncategorized'),
      escapeCSV(toAccName),
      escapeCSV(fee),
      escapeCSV(tx.tags?.join('; ') || ''),
      escapeCSV(tx.taxTreatment || ''),
      escapeCSV(tx.grossAmount || ''),
      escapeCSV(tx.taxWithheldAmount || ''),
      escapeCSV(tx.taxSourceLabel || ''),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\r\n');
}

/**
 * Parse CSV text into candidate transactions for preview & import
 */
export function parseCSVToTransactions(
  csvText: string,
  defaultAccountId: string,
  defaultCategoryId: string,
  baseCurrency: CurrencyCode
): Array<Partial<Transaction>> {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/"/g, ''));
  const dateIdx = headers.findIndex((h) => h.includes('date'));
  const amountIdx = headers.findIndex((h) => h.includes('amount') && !h.includes('base'));
  const descIdx = headers.findIndex((h) => h.includes('desc') || h.includes('note') || h.includes('payee'));
  const typeIdx = headers.findIndex((h) => h.includes('type'));
  const currIdx = headers.findIndex((h) => h.includes('curr'));
  const taxTreatmentIdx = headers.findIndex((h) => h.includes('taxtreatment'));
  const grossAmountIdx = headers.findIndex((h) => h.includes('grossamount'));
  const taxWithheldIdx = headers.findIndex((h) => h.includes('taxwithheld'));
  const taxLabelIdx = headers.findIndex((h) => h.includes('taxsourcelabel') || h.includes('taxlabel'));

  const parsed: Array<Partial<Transaction>> = [];

  for (let i = 1; i < lines.length; i++) {
    // Regex matching CSV tokens with quote handling
    const tokens: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let c = 0; c < lines[i].length; c++) {
      const char = lines[i][c];
      if (char === '"' && (c === 0 || lines[i][c - 1] !== '\\')) {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        tokens.push(cur.trim());
        cur = '';
      } else {
        cur += char;
      }
    }
    tokens.push(cur.trim());

    const rawAmount = amountIdx !== -1 ? parseFloat(tokens[amountIdx]?.replace(/[^0-9.-]/g, '')) : NaN;
    if (isNaN(rawAmount) || rawAmount === 0) continue;

    const rawDate = dateIdx !== -1 && tokens[dateIdx] ? tokens[dateIdx] : new Date().toISOString().split('T')[0];
    const rawDesc = descIdx !== -1 && tokens[descIdx] ? tokens[descIdx].replace(/^"|"$/g, '') : 'Imported transaction';
    const rawType = (typeIdx !== -1 && tokens[typeIdx] ? tokens[typeIdx].toLowerCase() : rawAmount < 0 ? 'expense' : 'income') as any;
    const finalAmount = Math.abs(rawAmount);

    const validTaxTreatments = ['not_applicable', 'withheld_at_source', 'needs_self_calculation'];
    const rawTaxTreatment = taxTreatmentIdx !== -1 && validTaxTreatments.includes(tokens[taxTreatmentIdx])
      ? (tokens[taxTreatmentIdx] as any)
      : undefined;
    const rawGross = grossAmountIdx !== -1 && tokens[grossAmountIdx] ? parseFloat(tokens[grossAmountIdx]) : undefined;
    const rawWithheld = taxWithheldIdx !== -1 && tokens[taxWithheldIdx] ? parseFloat(tokens[taxWithheldIdx]) : undefined;
    const rawTaxLabel = taxLabelIdx !== -1 && tokens[taxLabelIdx] ? tokens[taxLabelIdx] : undefined;

    parsed.push({
      date: rawDate,
      amount: finalAmount,
      type: ['expense', 'income', 'transfer', 'debt', 'receivable'].includes(rawType) ? rawType : 'expense',
      description: rawDesc,
      currency: currIdx !== -1 && tokens[currIdx] ? tokens[currIdx] : baseCurrency,
      exchangeRateToBase: 1.0,
      baseAmount: finalAmount,
      accountId: defaultAccountId,
      categoryId: defaultCategoryId,
      inputSource: 'manual',
      taxTreatment: rawTaxTreatment,
      grossAmount: !isNaN(rawGross as number) ? rawGross : undefined,
      taxWithheldAmount: !isNaN(rawWithheld as number) ? rawWithheld : undefined,
      taxSourceLabel: rawTaxLabel || undefined,
    });
  }

  return parsed;
}

/**
 * Generate formatted Excel (.xls/.xlsx compatible XML Spreadsheet)
 */
export function exportToExcelWorkbook(
  transactions: Transaction[],
  accounts: Account[],
  categories: Category[],
  debts: DebtReceivable[]
): string {
  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

  // XML Header for SpreadsheetML
  let xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Header">
   <Font ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#1E3A8A" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center"/>
  </Style>
  <Style ss:ID="Currency">
   <NumberFormat ss:Format="#,##0"/>
  </Style>
 </Styles>
`;

  // Worksheet 1: Transactions
  xml += ` <Worksheet ss:Name="Transactions">
  <Table>
   <Row ss:StyleID="Header">
    <Cell><Data ss:Type="String">Date</Data></Cell>
    <Cell><Data ss:Type="String">Type</Data></Cell>
    <Cell><Data ss:Type="String">Description</Data></Cell>
    <Cell><Data ss:Type="String">Amount</Data></Cell>
    <Cell><Data ss:Type="String">Currency</Data></Cell>
    <Cell><Data ss:Type="String">Account</Data></Cell>
    <Cell><Data ss:Type="String">Category</Data></Cell>
   </Row>
`;

  for (const tx of transactions) {
    xml += `   <Row>
    <Cell><Data ss:Type="String">${tx.date}</Data></Cell>
    <Cell><Data ss:Type="String">${tx.type}</Data></Cell>
    <Cell><Data ss:Type="String">${tx.description.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</Data></Cell>
    <Cell ss:StyleID="Currency"><Data ss:Type="Number">${tx.amount}</Data></Cell>
    <Cell><Data ss:Type="String">${tx.currency}</Data></Cell>
    <Cell><Data ss:Type="String">${(accountMap.get(tx.accountId) || '').replace(/&/g, '&amp;')}</Data></Cell>
    <Cell><Data ss:Type="String">${(categoryMap.get(tx.categoryId) || '').replace(/&/g, '&amp;')}</Data></Cell>
   </Row>
`;
  }
  xml += `  </Table>
 </Worksheet>
`;

  // Worksheet 2: Accounts Summary
  xml += ` <Worksheet ss:Name="Accounts">
  <Table>
   <Row ss:StyleID="Header">
    <Cell><Data ss:Type="String">Account Name</Data></Cell>
    <Cell><Data ss:Type="String">Type</Data></Cell>
    <Cell><Data ss:Type="String">Currency</Data></Cell>
    <Cell><Data ss:Type="String">Initial Balance</Data></Cell>
    <Cell><Data ss:Type="String">Current Balance</Data></Cell>
   </Row>
`;

  for (const acc of accounts) {
    xml += `   <Row>
    <Cell><Data ss:Type="String">${acc.name.replace(/&/g, '&amp;')}</Data></Cell>
    <Cell><Data ss:Type="String">${acc.type}</Data></Cell>
    <Cell><Data ss:Type="String">${acc.currency}</Data></Cell>
    <Cell ss:StyleID="Currency"><Data ss:Type="Number">${acc.initialBalance}</Data></Cell>
    <Cell ss:StyleID="Currency"><Data ss:Type="Number">${acc.currentBalance}</Data></Cell>
   </Row>
`;
  }
  // Worksheet 3: Debts & Receivables
  xml += ` <Worksheet ss:Name="Debts &amp; Receivables">
  <Table>
   <Row ss:StyleID="Header">
    <Cell><Data ss:Type="String">Type</Data></Cell>
    <Cell><Data ss:Type="String">Contact / Person</Data></Cell>
    <Cell><Data ss:Type="String">Original Amount</Data></Cell>
    <Cell><Data ss:Type="String">Remaining Balance</Data></Cell>
    <Cell><Data ss:Type="String">Currency</Data></Cell>
    <Cell><Data ss:Type="String">Status</Data></Cell>
    <Cell><Data ss:Type="String">Due Date</Data></Cell>
   </Row>
`;

  for (const debt of debts) {
    xml += `   <Row>
    <Cell><Data ss:Type="String">${debt.type}</Data></Cell>
    <Cell><Data ss:Type="String">${debt.personName.replace(/&/g, '&amp;')}</Data></Cell>
    <Cell ss:StyleID="Currency"><Data ss:Type="Number">${debt.originalAmount}</Data></Cell>
    <Cell ss:StyleID="Currency"><Data ss:Type="Number">${debt.currentBalance}</Data></Cell>
    <Cell><Data ss:Type="String">${debt.currency}</Data></Cell>
    <Cell><Data ss:Type="String">${debt.status}</Data></Cell>
    <Cell><Data ss:Type="String">${debt.dueDate || '-'}</Data></Cell>
   </Row>
`;
  }
  xml += `  </Table>
 </Worksheet>
</Workbook>`;

  return xml;
}

/**
 * Open a clean printable financial statement report window for browser printing / PDF generation
 */
export function openPrintableReportStatement(
  transactions: Transaction[],
  accounts: Account[],
  categories: Category[],
  baseCurrency: CurrencyCode,
  dateRangeLabel: string = 'Current Month'
): void {
  const totalIncome = transactions
    .filter((t) => !t.isDeleted && t.type === 'income')
    .reduce((s, t) => s + (t.baseAmount || t.amount), 0);

  const totalExpense = transactions
    .filter((t) => !t.isDeleted && t.type === 'expense')
    .reduce((s, t) => s + (t.baseAmount || t.amount), 0);

  const netSavings = totalIncome - totalExpense;
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Financial Statement - ${dateRangeLabel}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 40px; color: #1e293b; }
    h1 { margin-bottom: 4px; font-size: 24px; color: #0f172a; }
    .subtitle { color: #64748b; font-size: 13px; margin-bottom: 24px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 32px; }
    .kpi-card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; background: #f8fafc; }
    .kpi-card .label { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; }
    .kpi-card .val { font-size: 20px; font-weight: 800; font-family: monospace; margin-top: 4px; }
    .income { color: #16a34a; }
    .expense { color: #dc2626; }
    .net { color: #2563eb; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
    th { text-align: left; padding: 10px; background: #f1f5f9; border-bottom: 2px solid #cbd5e1; font-weight: 700; }
    td { padding: 10px; border-bottom: 1px solid #e2e8f0; }
    .num { text-align: right; font-family: monospace; }
    @media print {
      body { margin: 20px; }
      button { display: none; }
    }
  </style>
</head>
<body>
  <div style="display:flex; justify-content:space-between; align-items:center;">
    <div>
      <h1>MyFinancialFlow Statement</h1>
      <div class="subtitle">Period: ${dateRangeLabel} • Currency: ${baseCurrency}</div>
    </div>
    <button onclick="window.print()" style="padding:8px 16px; background:#2563eb; color:white; border:none; border-radius:8px; cursor:pointer; font-weight:bold;">
      Print / Save as PDF
    </button>
  </div>

  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="label">Total Inflow</div>
      <div class="val income">${formatCurrency(totalIncome, baseCurrency)}</div>
    </div>
    <div class="kpi-card">
      <div class="label">Total Outflow</div>
      <div class="val expense">${formatCurrency(totalExpense, baseCurrency)}</div>
    </div>
    <div class="kpi-card">
      <div class="label">Net Cash Flow</div>
      <div class="val net">${formatCurrency(netSavings, baseCurrency)}</div>
    </div>
  </div>

  <h3>Transaction Itemization (${transactions.length} records)</h3>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Type</th>
        <th>Description</th>
        <th>Account</th>
        <th>Category</th>
        <th class="num">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${transactions
        .map(
          (t) => `<tr>
          <td>${t.date}</td>
          <td style="text-transform:capitalize;">${t.type}</td>
          <td>${t.description}</td>
          <td>${accounts.find((a) => a.id === t.accountId)?.name || 'Account'}</td>
          <td>${categories.find((c) => c.id === t.categoryId)?.name || '-'}</td>
          <td class="num ${t.type === 'expense' ? 'expense' : t.type === 'income' ? 'income' : ''}">
            ${t.type === 'expense' ? '-' : t.type === 'income' ? '+' : ''}${formatCurrency(t.amount, t.currency)}
          </td>
        </tr>`
        )
        .join('')}
    </tbody>
  </table>
</body>
</html>`;

  printWindow.document.write(html);
  printWindow.document.close();
}
