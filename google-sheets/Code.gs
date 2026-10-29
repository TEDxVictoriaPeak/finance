// GENERATED FILE – copy ALL of this into Extensions › Apps Script › Code.gs
// Source: src/lib/pack.js + google-sheets/sync.gs.part (node scripts/build-gs.mjs)

// =====================================================================
// Google Sheets sync for the TEDxVictoriaPeak Finance Portal.
// Adds a "TEDx Finance" menu: Refresh now, Set up connection,
// daily auto-refresh. Rebuilds every tab of the Financial Report Pack
// from the portal, keeping the period you chose on the Cover tab.
// =====================================================================

function onOpen() {
  SpreadsheetApp.getUi().createMenu('TEDx Finance')
    .addItem('Refresh now', 'refreshReportPack')
    .addSeparator()
    .addItem('Set up connection', 'setupConnection')
    .addItem('Turn on daily auto-refresh (6am HK)', 'installDailyTrigger')
    .addItem('Turn off auto-refresh', 'removeTriggers')
    .addToUi()
}

function setupConnection() {
  var ui = SpreadsheetApp.getUi()
  var props = PropertiesService.getScriptProperties()
  var steps = [
    ['SUPABASE_URL', 'Supabase Project URL', 'e.g. https://abcdefgh.supabase.co'],
    ['SUPABASE_ANON_KEY', 'Supabase anon / publishable key', 'The same key you put in GitHub as VITE_SUPABASE_ANON_KEY'],
    ['EXPORT_KEY', 'Google Sheets key from the portal', 'Portal › Reports › Google Sheets › Create key (starts with gsk_)'],
  ]
  for (var i = 0; i < steps.length; i++) {
    var r = ui.prompt(steps[i][1], steps[i][2], ui.ButtonSet.OK_CANCEL)
    if (r.getSelectedButton() !== ui.Button.OK) return
    var v = r.getResponseText().trim().replace(/\/+$/, '')
    if (!v) { ui.alert('Nothing entered. Setup stopped.'); return }
    props.setProperty(steps[i][0], v)
  }
  ui.alert('Saved. Now choose TEDx Finance › Refresh now.')
}

function fetchReportData_() {
  var p = PropertiesService.getScriptProperties()
  var url = p.getProperty('SUPABASE_URL'), anon = p.getProperty('SUPABASE_ANON_KEY'), key = p.getProperty('EXPORT_KEY')
  if (!url || !anon || !key) throw new Error('Not connected yet. Choose TEDx Finance › Set up connection.')
  var res = UrlFetchApp.fetch(url + '/rest/v1/rpc/report_data', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: anon, Authorization: 'Bearer ' + anon },
    payload: JSON.stringify({ p_key: key }),
  })
  if (res.getResponseCode() !== 200) {
    var msg = res.getContentText()
    try { msg = JSON.parse(msg).message || msg } catch (e) {}
    throw new Error('The portal refused the request (' + res.getResponseCode() + '): ' + msg)
  }
  return JSON.parse(res.getContentText())
}

function toDate_(s) { var p = String(s).slice(0, 10).split('-'); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])) }
function colLetter_(n) { var s = ''; n++; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return s }

function refreshReportPack() {
  var ss = SpreadsheetApp.getActiveSpreadsheet()
  try {
    var data = fetchReportData_()
    var sheets = buildPack(data)
    // Keep the period the user chose on the Cover tab
    var old = ss.getSheetByName('Cover')
    if (old) {
      var keep = old.getRange('C5:C7').getValues()
      if (keep[0][0] instanceof Date) sheets[0].rows[4][2] = { v: keep[0][0], s: 'dateIn' }
      if (keep[1][0] instanceof Date) sheets[0].rows[5][2] = { v: keep[1][0], s: 'dateIn' }
      if (typeof keep[2][0] === 'number' && keep[2][0] > 2000) sheets[0].rows[6][2] = { v: keep[2][0], s: 'intIn' }
    }
    sheets.forEach(function (sh, i) { renderSheet_(ss, sh, i) })
    var blank = ss.getSheetByName('Sheet1') || ss.getSheetByName('Sheet 1')
    if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank)
    ss.setActiveSheet(ss.getSheetByName('Cover'))
    ss.toast('Updated from the Finance Portal (' + data.generated_at + ')', 'TEDx Finance', 5)
  } catch (e) {
    ss.toast(String(e.message || e), 'TEDx Finance – refresh failed', 15)
    throw e
  }
}

function renderSheet_(ss, sh, index) {
  var sheet = ss.getSheetByName(sh.name) || ss.insertSheet(sh.name)
  ss.setActiveSheet(sheet); ss.moveActiveSheet(index + 1)
  sheet.clear(); sheet.setFrozenRows(0)
  var width = Math.max(1, sh.widths.length, sh.rows.reduce(function (m, r) { return Math.max(m, r.length) }, 0))
  var styleCells = {}
  var values = sh.rows.map(function (row, ri) {
    var out = []
    for (var ci = 0; ci < width; ci++) {
      var c = row[ci], v = ''
      if (c !== null && c !== undefined && c !== '') {
        if (typeof c !== 'object' || c instanceof Date) c = { v: c }
        if (c.f) v = '=' + c.f
        else if ((c.s === 'date' || c.s === 'dateIn') && c.v && !(c.v instanceof Date)) v = toDate_(c.v)
        else if (typeof c.v === 'boolean') v = c.v ? 'Yes' : ''
        else if (typeof c.v === 'string' && /^[=+@]/.test(c.v)) v = "'" + c.v
        else v = c.v === null || c.v === undefined ? '' : c.v
        if (c.s) (styleCells[c.s] = styleCells[c.s] || []).push([ri, ci])
      }
      out.push(v)
    }
    return out
  })
  if (values.length) sheet.getRange(1, 1, values.length, width).setValues(values)

  Object.keys(styleCells).forEach(function (name) {
    var st = PACK_STYLES[name]; if (!st) return
    // group cells into vertical runs per column to keep it fast
    var byCol = {}
    styleCells[name].forEach(function (rc) { (byCol[rc[1]] = byCol[rc[1]] || []).push(rc[0]) })
    var a1 = []
    Object.keys(byCol).forEach(function (ci) {
      var rows = byCol[ci].sort(function (a, b) { return a - b }), start = rows[0], prev = rows[0]
      for (var k = 1; k <= rows.length; k++) {
        if (k < rows.length && rows[k] === prev + 1) { prev = rows[k]; continue }
        var L = colLetter_(Number(ci))
        a1.push(L + (start + 1) + (prev > start ? ':' + L + (prev + 1) : ''))
        if (k < rows.length) { start = rows[k]; prev = rows[k] }
      }
    })
    for (var i = 0; i < a1.length; i += 400) {
      var rl = sheet.getRangeList(a1.slice(i, i + 400))
      if (st.num) rl.setNumberFormat(st.num)
      if (st.bold) rl.setFontWeight('bold')
      if (st.italic) rl.setFontStyle('italic')
      if (st.size) rl.setFontSize(st.size)
      if (st.color) rl.setFontColor(st.color)
      if (st.fill) rl.setBackground(st.fill)
      if (st.top) rl.setBorder(true, null, null, null, null, null, '#0B2440', SpreadsheetApp.BorderStyle.SOLID)
    }
  })
  sh.widths.forEach(function (w, i) { sheet.setColumnWidth(i + 1, Math.round(w * 7.5)) })
  if (sh.freeze) sheet.setFrozenRows(sh.freeze)
  sheet.setHiddenGridlines(sh.freeze === 0)
}

function installDailyTrigger() {
  removeTriggers()
  ScriptApp.newTrigger('refreshReportPack').timeBased().everyDays(1).atHour(6).inTimezone('Asia/Hong_Kong').create()
  SpreadsheetApp.getUi().alert('Daily auto-refresh is on (around 6am Hong Kong time). You can still use Refresh now anytime.')
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'refreshReportPack') ScriptApp.deleteTrigger(t)
  })
}

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

