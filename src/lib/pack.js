// =====================================================================
// Financial Report Pack builder.
// Turns report_data() from the database into spreadsheet tabs with live
// formulas. The same code runs in the website (.xlsx download) and in the
// Google Sheets sync script (google-sheets/Code.gs), so both always match.
// Plain JavaScript on purpose (works in browsers and Google Apps Script).
//
// Cell: null | string | number | { v?, f?, s? }
//   v = value, f = formula without "=", s = style name (see STYLES below)
// Sheet: { name, widths: number[], rows: Cell[][], freeze: number }
// =====================================================================

var PACK_STYLES = {
  title: { bold: true, size: 15 },
  sub: { italic: true, color: '#4B5563' },
  section: { bold: true, fill: '#E8EDF4' },
  head: { bold: true, fill: '#0B2440', color: '#FFFFFF' },
  bold: { bold: true },
  note: { italic: true, color: '#4B5563' },
  money: { num: '#,##0.00;(#,##0.00);"-"' },
  moneyB: { num: '#,##0.00;(#,##0.00);"-"', bold: true },
  moneyT: { num: '#,##0.00;(#,##0.00);"-"', bold: true, top: true },
  moneyG: { num: '#,##0.00;(#,##0.00);"-"', bold: true, top: true, fill: '#FFF4DB' },
  labelT: { bold: true, top: true },
  labelG: { bold: true, top: true, fill: '#FFF4DB' },
  date: { num: 'd mmm yyyy' },
  dateIn: { num: 'd mmm yyyy', fill: '#FFF59D', bold: true },
  intIn: { num: '0', fill: '#FFF59D', bold: true },
  int: { num: '0' },
  pct: { num: '0%' },
  check: { bold: true, color: '#0F7B45' },
}

function buildPack(data) {
  var COVER = 'Cover', IE = 'Income & Expenditure', SOFP = 'Financial Position', CF = 'Cash Flow',
    BVA = 'Budget vs Actual', TB = 'Trial Balance', AP = 'Payables Aging', SPN = 'Sponsors',
    TX = 'Transactions', JR = 'Journal', COA = 'Chart of Accounts', BUD = 'Budget', REC = 'Bank Reconciliation'

  function q(name) { return "'" + name.replace(/'/g, "''") + "'" }
  function col(n) { var s = ''; n++; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return s }
  function J(c) { return q(JR) + '!$' + c + ':$' + c }
  function T(c) { return q(TX) + '!$' + c + ':$' + c }
  function B(c) { return q(BUD) + '!$' + c + ':$' + c }
  var START = q(COVER) + '!$C$5', END = q(COVER) + '!$C$6', FY = q(COVER) + '!$C$7', FYS = q(COVER) + '!$C$8', FYE = q(COVER) + '!$C$9'
  var PERIOD = J('A') + ',">="&' + START + ',' + J('A') + ',"<="&' + END
  var UPTO = J('A') + ',"<="&' + END
  var BEFORE = J('A') + ',"<"&' + START
  function sumJ(c, conds) { return 'SUMIFS(' + J(c) + ',' + conds + ')' }
  function fmtTxt(ref) { return 'TEXT(' + ref + ',"d mmm yyyy")' }
  function H(list) { return list.map(function (x) { return { v: x, s: 'head' } }) }

  var accounts = data.accounts || [] // [code, name, type, is_cash, normal, archived, system_key]
  var journal = data.journal || []   // [date, ref, type, desc, code, name, acctype, dr, cr, div, cat, sponsor]
  var used = {}
  journal.forEach(function (l) { used[l[4]] = true })
  var isCash = {}
  accounts.forEach(function (a) { if (a[3]) isCash[a[0]] = true })
  function acc(type) { return accounts.filter(function (a) { return a[2] === type && (!a[5] || used[a[0]]) }) }
  function sysCode(key) { var a = accounts.filter(function (x) { return x[6] === key })[0]; return a ? a[0] : '' }

  var today = data.today
  var periodEnd = data.fy_end < today ? data.fy_end : today
  var sheets = {}

  // ---------------- Journal (raw) ----------------
  sheets[JR] = {
    name: JR, freeze: 1, widths: [12, 15, 16, 40, 10, 28, 11, 14, 14, 18, 22, 18, 10],
    rows: [H(['Date', 'Reference', 'Entry type', 'Description', 'Account code', 'Account name', 'Account type', 'Debit', 'Credit', 'Division', 'Category', 'Sponsor', 'Cash account'])]
      .concat(journal.map(function (l) {
        return [{ v: l[0], s: 'date' }, l[1], l[2], l[3], String(l[4]), l[5], l[6], { v: l[7], s: 'money' }, { v: l[8], s: 'money' }, l[9], l[10], l[11], isCash[l[4]] ? 'Yes' : '']
      })),
  }

  // ---------------- Transactions (raw) ----------------
  var txHead = ['Reference', 'Date', 'Payment date', 'Type', 'Status', 'Title', 'Payee / from', 'Amount', 'In / Out', 'In-kind', 'Division', 'Category',
    'How paid', 'Account', 'To account', 'Sponsor', 'Submitted by', 'Submitted at', 'Division approval', 'Finance approval', 'Organizer sign-off',
    'Income verified by', 'Receipt', 'Over-budget reason', 'Void reason']
  sheets[TX] = {
    name: TX, freeze: 1, widths: [15, 12, 12, 15, 20, 34, 22, 14, 8, 8, 18, 22, 18, 18, 14, 16, 18, 16, 24, 24, 24, 24, 8, 30, 30],
    rows: [H(txHead)].concat((data.transactions || []).map(function (t) {
      return t.map(function (v, i) {
        if (i === 1 || i === 2) return v ? { v: v, s: 'date' } : ''
        if (i === 7) return { v: v, s: 'money' }
        return v === null ? '' : v
      })
    })),
  }

  // ---------------- Budget (raw) ----------------
  sheets[BUD] = {
    name: BUD, freeze: 1, widths: [10, 22, 26, 13, 14],
    rows: [H(['Budget year', 'Division', 'Category', 'Account code', 'Budget'])].concat((data.budgets || []).map(function (b) {
      return [{ v: b[0], s: 'int' }, b[1], b[2], String(b[3]), { v: b[4], s: 'money' }]
    })),
  }

  // ---------------- Chart of accounts ----------------
  sheets[COA] = {
    name: COA, freeze: 1, widths: [10, 30, 11, 12, 14, 10, 18],
    rows: [H(['Code', 'Account', 'Type', 'Cash account', 'Normal balance', 'Archived', 'Balance at period end'])].concat(accounts.map(function (a, i) {
      var r = i + 2, debitNormal = a[2] === 'asset' || a[2] === 'expense'
      var f = debitNormal ? sumJ('H', J('E') + ',$A' + r + ',' + UPTO) + '-' + sumJ('I', J('E') + ',$A' + r + ',' + UPTO)
        : sumJ('I', J('E') + ',$A' + r + ',' + UPTO) + '-' + sumJ('H', J('E') + ',$A' + r + ',' + UPTO)
      return [String(a[0]), a[1], a[2], a[3] ? 'Yes' : '', a[4], a[5] ? 'Yes' : '', { f: f, s: 'money' }]
    })),
  }

  // ---------------- Income & Expenditure ----------------
  var ie = [
    [{ v: 'Income & Expenditure Statement', s: 'title' }],
    [{ f: '"For the period "&' + fmtTxt(START) + '&" to "&' + fmtTxt(END), s: 'sub' }],
    [],
    H(['Code', 'Account', 'Actual', 'Budget (budget year)', 'Variance', '% of budget']),
    [{ v: 'Income', s: 'section' }, { v: '', s: 'section' }, { v: '', s: 'section' }, { v: '', s: 'section' }, { v: '', s: 'section' }, { v: '', s: 'section' }],
  ]
  var incStart = ie.length + 1
  acc('income').forEach(function (a) {
    var r = ie.length + 1
    ie.push([String(a[0]), a[1], { f: sumJ('I', J('E') + ',$A' + r + ',' + PERIOD) + '-' + sumJ('H', J('E') + ',$A' + r + ',' + PERIOD), s: 'money' }])
  })
  var incEnd = ie.length
  var tiRow = ie.length + 1
  ie.push([{ v: '', s: 'labelT' }, { v: 'Total income', s: 'labelT' }, { f: incEnd >= incStart ? 'SUM(C' + incStart + ':C' + incEnd + ')' : '0', s: 'moneyT' }])
  ie.push([])
  ie.push([{ v: 'Expenses', s: 'section' }, { v: '', s: 'section' }, { v: '', s: 'section' }, { v: '', s: 'section' }, { v: '', s: 'section' }, { v: '', s: 'section' }])
  var expStart = ie.length + 1
  acc('expense').forEach(function (a) {
    var r = ie.length + 1
    ie.push([String(a[0]), a[1],
      { f: sumJ('H', J('E') + ',$A' + r + ',' + PERIOD) + '-' + sumJ('I', J('E') + ',$A' + r + ',' + PERIOD), s: 'money' },
      { f: 'SUMIFS(' + B('E') + ',' + B('D') + ',$A' + r + ',' + B('A') + ',' + FY + ')', s: 'money' },
      { f: 'D' + r + '-C' + r, s: 'money' },
      { f: 'IF(D' + r + '=0,"",C' + r + '/D' + r + ')', s: 'pct' }])
  })
  var expEnd = ie.length
  var teRow = ie.length + 1
  var se = function (c) { return expEnd >= expStart ? 'SUM(' + c + expStart + ':' + c + expEnd + ')' : '0' }
  ie.push([{ v: '', s: 'labelT' }, { v: 'Total expenses', s: 'labelT' }, { f: se('C'), s: 'moneyT' }, { f: se('D'), s: 'moneyT' }, { f: 'D' + teRow + '-C' + teRow, s: 'moneyT' }, { f: 'IF(D' + teRow + '=0,"",C' + teRow + '/D' + teRow + ')', s: 'pct' }])
  ie.push([])
  var surRow = ie.length + 1
  ie.push([{ v: '', s: 'labelG' }, { f: 'IF(C' + surRow + '>=0,"Surplus","Deficit")', s: 'labelG' }, { f: 'C' + tiRow + '-C' + teRow, s: 'moneyG' }])
  ie.push([])
  ie.push([{ v: 'Budget column shows the full budget for the budget year on the Cover tab. In-kind sponsorship appears as both income and expense at fair value.', s: 'note' }])
  sheets[IE] = { name: IE, freeze: 4, widths: [10, 34, 16, 18, 16, 12], rows: ie }

  // ---------------- Financial Position ----------------
  var fp = [
    [{ v: 'Statement of Financial Position', s: 'title' }],
    [{ f: '"As at "&' + fmtTxt(END), s: 'sub' }],
    [],
    H(['Code', 'Item', 'HK$']),
    [{ v: 'Assets', s: 'section' }, { v: '', s: 'section' }, { v: '', s: 'section' }],
  ]
  var aS = fp.length + 1
  acc('asset').forEach(function (a) {
    var r = fp.length + 1
    fp.push([String(a[0]), a[1], { f: sumJ('H', J('E') + ',$A' + r + ',' + UPTO) + '-' + sumJ('I', J('E') + ',$A' + r + ',' + UPTO), s: 'money' }])
  })
  var aE = fp.length, taRow = fp.length + 1
  fp.push([{ v: '', s: 'labelT' }, { v: 'Total assets', s: 'labelT' }, { f: aE >= aS ? 'SUM(C' + aS + ':C' + aE + ')' : '0', s: 'moneyT' }])
  fp.push([])
  fp.push([{ v: 'Liabilities', s: 'section' }, { v: '', s: 'section' }, { v: '', s: 'section' }])
  var lS = fp.length + 1
  acc('liability').forEach(function (a) {
    var r = fp.length + 1
    fp.push([String(a[0]), a[1], { f: sumJ('I', J('E') + ',$A' + r + ',' + UPTO) + '-' + sumJ('H', J('E') + ',$A' + r + ',' + UPTO), s: 'money' }])
  })
  var lE = fp.length, tlRow = fp.length + 1
  fp.push([{ v: '', s: 'labelT' }, { v: 'Total liabilities', s: 'labelT' }, { f: lE >= lS ? 'SUM(C' + lS + ':C' + lE + ')' : '0', s: 'moneyT' }])
  fp.push([])
  var naRow = fp.length + 1
  fp.push([{ v: '', s: 'labelG' }, { v: 'Net assets', s: 'labelG' }, { f: 'C' + taRow + '-C' + tlRow, s: 'moneyG' }])
  fp.push([])
  fp.push([{ v: 'Funds', s: 'section' }, { v: '', s: 'section' }, { v: '', s: 'section' }])
  var ofRow = fp.length + 1
  fp.push(['', 'Opening fund', { f: sumJ('I', J('G') + ',"fund",' + UPTO) + '-' + sumJ('H', J('G') + ',"fund",' + UPTO), s: 'money' }])
  var asRow = fp.length + 1
  fp.push(['', 'Accumulated surplus / (deficit)', {
    f: '(' + sumJ('I', J('G') + ',"income",' + UPTO) + '-' + sumJ('H', J('G') + ',"income",' + UPTO) + ')-(' +
      sumJ('H', J('G') + ',"expense",' + UPTO) + '-' + sumJ('I', J('G') + ',"expense",' + UPTO) + ')', s: 'money'
  }])
  var tfRow = fp.length + 1
  fp.push([{ v: '', s: 'labelG' }, { v: 'Total funds', s: 'labelG' }, { f: 'C' + ofRow + '+C' + asRow, s: 'moneyG' }])
  fp.push([])
  var fpCheckRow = fp.length + 1
  fp.push(['', 'Check: net assets − total funds (must be 0)', { f: 'ROUND(C' + naRow + '-C' + tfRow + ',2)', s: 'money' }])
  sheets[SOFP] = { name: SOFP, freeze: 4, widths: [10, 40, 18], rows: fp }

  // ---------------- Cash Flow ----------------
  var cf = [
    [{ v: 'Cash Flow Summary', s: 'title' }],
    [{ f: '"For the period "&' + fmtTxt(START) + '&" to "&' + fmtTxt(END), s: 'sub' }],
    [],
    H(['Code', 'Account', 'Opening', 'Money in', 'Money out', 'Closing']),
  ]
  var cS = cf.length + 1
  accounts.filter(function (a) { return a[3] && (!a[5] || used[a[0]]) }).forEach(function (a) {
    var r = cf.length + 1, c = J('E') + ',$A' + r + ','
    cf.push([String(a[0]), a[1],
      { f: sumJ('H', c + BEFORE) + '-' + sumJ('I', c + BEFORE), s: 'money' },
      { f: sumJ('H', c + PERIOD), s: 'money' },
      { f: sumJ('I', c + PERIOD), s: 'money' },
      { f: 'C' + r + '+D' + r + '-E' + r, s: 'money' }])
  })
  var cE = cf.length, cTot = cf.length + 1
  var sc = function (c) { return cE >= cS ? 'SUM(' + c + cS + ':' + c + cE + ')' : '0' }
  cf.push([{ v: '', s: 'labelT' }, { v: 'Total cash', s: 'labelT' }, { f: sc('C'), s: 'moneyT' }, { f: sc('D'), s: 'moneyT' }, { f: sc('E'), s: 'moneyT' }, { f: sc('F'), s: 'moneyT' }])
  cf.push([])
  cf.push([{ v: 'Where the cash came from and went', s: 'section' }, { v: '', s: 'section' }, { v: '', s: 'section' }, { v: '', s: 'section' }, { v: '', s: 'section' }, { v: '', s: 'section' }])
  var mS = cf.length + 1
  ;[['Income', 'Receipts from income and sponsors'], ['Expense', 'Payments for expenses, reimbursements and invoices'],
    ['Cash advance', 'Cash advances given to members'], ['Advance returned', 'Cash advances returned'],
    ['Transfer', 'Transfers between own accounts (net zero)'], ['Opening balance', 'Opening balances entered']].forEach(function (x) {
    cf.push(['', x[1], '', '', '', { f: sumJ('H', J('M') + ',"Yes",' + J('C') + ',"' + x[0] + '",' + PERIOD) + '-' + sumJ('I', J('M') + ',"Yes",' + J('C') + ',"' + x[0] + '",' + PERIOD), s: 'money' }])
  })
  var mE = cf.length, ncRow = cf.length + 1
  cf.push([{ v: '', s: 'labelG' }, { v: 'Net change in cash', s: 'labelG' }, '', '', '', { f: 'SUM(F' + mS + ':F' + mE + ')', s: 'moneyG' }])
  cf.push(['', 'Check: net change − (closing − opening) (must be 0)', '', '', '', { f: 'ROUND(F' + ncRow + '-(F' + cTot + '-C' + cTot + '),2)', s: 'money' }])
  sheets[CF] = { name: CF, freeze: 4, widths: [10, 46, 16, 16, 16, 16], rows: cf }

  // ---------------- Budget vs Actual ----------------
  var bv = [
    [{ v: 'Budget vs Actual', s: 'title' }],
    [{ f: '"Budget year "&' + fmtTxt(FYS) + '&" to "&' + fmtTxt(FYE) + '&" · Pending = submitted but not yet approved"', s: 'sub' }],
    [],
    H(['Division', 'Category', 'Budget', 'Actual', 'Pending', 'Available', '% used']),
  ]
  var bS = bv.length + 1
  ;(data.budget_lines || []).forEach(function (x) {
    var r = bv.length + 1
    var fyRange = J('A') + ',">="&' + FYS + ',' + J('A') + ',"<="&' + FYE
    var cond = J('J') + ',$A' + r + ',' + J('K') + ',$B' + r + ',' + J('G') + ',"expense",' + fyRange
    bv.push([x[0], x[1],
      { f: 'SUMIFS(' + B('E') + ',' + B('A') + ',' + FY + ',' + B('B') + ',$A' + r + ',' + B('C') + ',$B' + r + ')', s: 'money' },
      { f: sumJ('H', cond) + '-' + sumJ('I', cond), s: 'money' },
      { f: 'SUMIFS(' + T('H') + ',' + T('K') + ',$A' + r + ',' + T('L') + ',$B' + r + ',' + T('D') + ',"Expense",' + T('E') + ',"Pending*",' + T('B') + ',">="&' + FYS + ',' + T('B') + ',"<="&' + FYE + ')', s: 'money' },
      { f: 'C' + r + '-D' + r + '-E' + r, s: 'money' },
      { f: 'IF(C' + r + '=0,"",(D' + r + '+E' + r + ')/C' + r + ')', s: 'pct' }])
  })
  var bE = bv.length, bT = bv.length + 1
  var sb = function (c) { return bE >= bS ? 'SUM(' + c + bS + ':' + c + bE + ')' : '0' }
  bv.push([{ v: 'Total', s: 'labelT' }, { v: '', s: 'labelT' }, { f: sb('C'), s: 'moneyT' }, { f: sb('D'), s: 'moneyT' }, { f: sb('E'), s: 'moneyT' }, { f: sb('F'), s: 'moneyT' }, { f: 'IF(C' + bT + '=0,"",(D' + bT + '+E' + bT + ')/C' + bT + ')', s: 'pct' }])
  sheets[BVA] = { name: BVA, freeze: 4, widths: [22, 26, 16, 16, 16, 16, 10], rows: bv }

  // ---------------- Trial Balance ----------------
  var tb = [
    [{ v: 'Trial Balance', s: 'title' }],
    [{ f: '"As at "&' + fmtTxt(END), s: 'sub' }],
    [],
    H(['Code', 'Account', 'Type', 'Debit', 'Credit']),
  ]
  var tS = tb.length + 1
  accounts.filter(function (a) { return !a[5] || used[a[0]] }).forEach(function (a) {
    var r = tb.length + 1, c = J('E') + ',$A' + r + ',' + UPTO
    tb.push([String(a[0]), a[1], a[2],
      { f: 'MAX(0,' + sumJ('H', c) + '-' + sumJ('I', c) + ')', s: 'money' },
      { f: 'MAX(0,' + sumJ('I', c) + '-' + sumJ('H', c) + ')', s: 'money' }])
  })
  var tE = tb.length, tT = tb.length + 1
  tb.push([{ v: '', s: 'labelT' }, { v: 'Total', s: 'labelT' }, { v: '', s: 'labelT' }, { f: tE >= tS ? 'SUM(D' + tS + ':D' + tE + ')' : '0', s: 'moneyT' }, { f: tE >= tS ? 'SUM(E' + tS + ':E' + tE + ')' : '0', s: 'moneyT' }])
  var tbCheckRow = tb.length + 1
  tb.push(['', 'Difference (must be 0)', '', { f: 'ROUND(D' + tT + '-E' + tT + ',2)', s: 'money' }])
  sheets[TB] = { name: TB, freeze: 4, widths: [10, 34, 11, 16, 16], rows: tb }

  // ---------------- Payables Aging ----------------
  var ap = [
    [{ v: 'Outstanding Reimbursements & Supplier Invoices', s: 'title' }],
    [{ f: '"Approved but not yet paid · ages as at "&' + fmtTxt('TODAY()') + '&" · list as at last refresh (' + data.generated_at + ')"', s: 'sub' }],
    [],
    H(['Reference', 'Type', 'Payee / member', 'Title', 'Division', 'Approved on', 'Amount', 'Days', '0–30 days', '31–60 days', 'Over 60 days']),
  ]
  var pS = ap.length + 1
  ;(data.payables || []).forEach(function (p) {
    var r = ap.length + 1
    ap.push([p[0], p[1], p[2], p[3], p[4], { v: p[5], s: 'date' }, { v: p[6], s: 'money' },
      { f: 'TODAY()-F' + r, s: 'int' },
      { f: 'IF(H' + r + '<=30,G' + r + ',0)', s: 'money' },
      { f: 'IF(AND(H' + r + '>30,H' + r + '<=60),G' + r + ',0)', s: 'money' },
      { f: 'IF(H' + r + '>60,G' + r + ',0)', s: 'money' }])
  })
  var pE = ap.length, apTotRow = ap.length + 1
  var sp = function (c) { return pE >= pS ? 'SUM(' + c + pS + ':' + c + pE + ')' : '0' }
  ap.push([{ v: 'Total', s: 'labelT' }, '', '', '', '', '', { f: sp('G'), s: 'moneyT' }, '', { f: sp('I'), s: 'moneyT' }, { f: sp('J'), s: 'moneyT' }, { f: sp('K'), s: 'moneyT' }])
  if (pE < pS) ap.push([{ v: 'Nothing outstanding.', s: 'note' }])
  sheets[AP] = { name: AP, freeze: 4, widths: [15, 16, 22, 32, 18, 13, 14, 7, 13, 13, 13], rows: ap }

  // ---------------- Sponsors ----------------
  var sr = [
    [{ v: 'Sponsorship Statement', s: 'title' }],
    [{ v: 'As at last refresh (' + data.generated_at + ')', s: 'sub' }],
    [],
    H(['Sponsor', 'Tier', 'Status', 'Person in charge', 'In-kind', 'Agreed', 'Invoiced', 'Cash received', 'In-kind received', 'Invoice outstanding', 'Still to receive vs agreed', 'Benefits owed', 'Benefits delivered']),
  ]
  var sS = sr.length + 1
  ;(data.sponsors || []).forEach(function (s) {
    var r = sr.length + 1
    sr.push([s[0], s[1], s[2], s[3], s[4], { v: s[5], s: 'money' }, { v: s[6], s: 'money' }, { v: s[7], s: 'money' }, { v: s[8], s: 'money' },
      { v: Math.max(0, Math.round((s[6] - s[9]) * 100) / 100), s: 'money' },
      { f: 'IF(C' + r + '="Lost",0,MAX(0,F' + r + '-H' + r + '-I' + r + '))', s: 'money' }, s[10], s[11]])
  })
  var sE = sr.length
  var ss = function (c) { return sE >= sS ? 'SUM(' + c + sS + ':' + c + sE + ')' : '0' }
  sr.push([{ v: 'Total', s: 'labelT' }, '', '', '', '', { f: ss('F'), s: 'moneyT' }, { f: ss('G'), s: 'moneyT' }, { f: ss('H'), s: 'moneyT' }, { f: ss('I'), s: 'moneyT' }, { f: ss('J'), s: 'moneyT' }, { f: ss('K'), s: 'moneyT' }])
  sheets[SPN] = { name: SPN, freeze: 4, widths: [24, 11, 11, 18, 8, 14, 14, 14, 14, 14, 16, 30, 30], rows: sr }

  // ---------------- Bank Reconciliation ----------------
  sheets[REC] = {
    name: REC, freeze: 1, widths: [22, 14, 16, 16, 14, 18, 17],
    rows: [H(['Account', 'Statement date', 'Statement balance', 'System balance', 'Difference', 'Checked by', 'Checked at'])].concat((data.reconciliations || []).map(function (x) {
      return [x[0], { v: x[1], s: 'date' }, { v: x[2], s: 'money' }, { v: x[3], s: 'money' }, { v: x[4], s: 'money' }, x[5], x[6]]
    })),
  }

  // ---------------- Cover ----------------
  var m = data.fy_start_month || 7
  var recv = sysCode('receivable')
  var cv = [
    [{ v: (data.org_name || 'TEDxVictoriaPeak') + ' — Financial Report Pack', s: 'title' }],
    [{ v: 'Generated ' + data.generated_at + ' from the Finance Portal. Generated tabs are rebuilt on every refresh: add your own notes on a new tab.', s: 'sub' }],
    [],
    [{ v: 'Reporting period (change the yellow cells and every tab recalculates)', s: 'section' }, { v: '', s: 'section' }, { v: '', s: 'section' }],
    ['', 'Period start', { v: data.fy_start, s: 'dateIn' }],
    ['', 'Period end / as at', { v: periodEnd, s: 'dateIn' }],
    ['', 'Budget year (financial year ending in)', { v: data.current_fy, s: 'intIn' }],
    ['', 'Budget year starts', { f: m === 1 ? 'DATE(C7,1,1)' : 'DATE(C7-1,' + m + ',1)', s: 'date' }],
    ['', 'Budget year ends', { f: 'EDATE(C8,12)-1', s: 'date' }],
    [],
    [{ v: 'Key figures', s: 'section' }, { v: '', s: 'section' }, { v: '', s: 'section' }],
    ['', 'Total income', { f: q(IE) + '!C' + tiRow, s: 'money' }],
    ['', 'Total expenses', { f: q(IE) + '!C' + teRow, s: 'money' }],
    ['', 'Surplus / (deficit)', { f: q(IE) + '!C' + surRow, s: 'moneyB' }],
    ['', 'Cash at period end', { f: q(CF) + '!F' + cTot, s: 'money' }],
    ['', 'Sponsor money still to receive', { f: recv ? sumJ('H', J('E') + ',"' + recv + '",' + UPTO) + '-' + sumJ('I', J('E') + ',"' + recv + '",' + UPTO) : '0', s: 'money' }],
    ['', 'Total liabilities (what we owe)', { f: q(SOFP) + '!C' + tlRow, s: 'money' }],
    ['', 'Net assets', { f: q(SOFP) + '!C' + naRow, s: 'moneyB' }],
    ['', 'Books check', { f: 'IF(AND(' + q(TB) + '!D' + tbCheckRow + '=0,' + q(SOFP) + '!C' + fpCheckRow + '=0),"OK – debits equal credits and the balance sheet balances","CHECK – see Trial Balance and Financial Position")', s: 'check' }],
    [],
    [{ v: 'Sign-off', s: 'section' }, { v: '', s: 'section' }, { v: '', s: 'section' }],
    ['', 'Prepared by (Head of Finance)', 'Name / signature / date:'],
    ['', 'Reviewed by (Organizer)', 'Name / signature / date:'],
    [],
    [{ v: 'Basis of preparation', s: 'section' }, { v: '', s: 'section' }, { v: '', s: 'section' }],
  ]
  ;[
    'Amounts are in Hong Kong dollars (HKD).',
    'Accrual basis: an expense is recognised when it receives final approval. Approved reimbursements and supplier invoices not yet paid are shown as liabilities.',
    'Income is recognised when the finance team verifies it. Sponsor invoices are recognised when issued and shown as a receivable until paid.',
    'In-kind sponsorship is recorded at fair value as both income and expense, with no effect on cash.',
    'Deposits paid in advance are assets until the service is delivered, then moved to expenses.',
    'Pending, returned and rejected entries are excluded. Voided entries are reversed, never deleted, so every change stays visible in the Journal.',
    'Every figure is a formula over the Journal tab, which lists every double-entry line from the Finance Portal.',
    'Months closed in the portal: ' + ((data.locked_months || []).length ? data.locked_months.join(', ') : 'none yet') + '.',
  ].forEach(function (t) { cv.push(['', { v: '• ' + t, s: 'note' }]) })
  sheets[COVER] = { name: COVER, freeze: 0, widths: [3, 44, 70], rows: cv }

  return [COVER, IE, SOFP, CF, BVA, TB, AP, SPN, TX, JR, COA, BUD, REC].map(function (n) { return sheets[n] })
}

// Export for the website build; ignored by Google Apps Script.
export { buildPack, PACK_STYLES }
