export const money = (cents: number | null | undefined, opts: { sign?: boolean } = {}) => {
  const v = Number(cents || 0) / 100
  const s = Math.abs(v).toLocaleString('en-HK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const neg = v < 0
  if (opts.sign) return (neg ? '-' : '+') + 'HK$' + s
  return (neg ? '-' : '') + 'HK$' + s
}

/** "1,234.5" -> 123450 cents. Returns null when not a valid amount. */
export const parseMoney = (txt: string): number | null => {
  const clean = String(txt || '').replace(/[^0-9.\-]/g, '')
  if (!clean || isNaN(Number(clean))) return null
  return Math.round(Number(clean) * 100)
}

export const centsToInput = (c: number | null | undefined) => (c ? (c / 100).toFixed(2) : '')

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—'
  const [y, m, day] = d.slice(0, 10).split('-').map(Number)
  return `${day} ${MONTHS[m - 1]} ${y}`
}
export const fmtDateTime = (d: string | null | undefined) => {
  if (!d) return '—'
  const dt = new Date(d)
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}, ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
}
export const monthLabel = (d: string) => {
  const [y, m] = d.slice(0, 7).split('-').map(Number)
  return `${['January','February','March','April','May','June','July','August','September','October','November','December'][m - 1]} ${y}`
}
export const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000)

// Fiscal year: named by the calendar year it ends in (start month from settings)
export const fyOf = (d: string, startMonth: number) => {
  const [y, m] = d.split('-').map(Number)
  if (startMonth === 1) return y
  return m >= startMonth ? y + 1 : y
}
export const fyStart = (fy: number, startMonth: number) =>
  startMonth === 1 ? `${fy}-01-01` : `${fy - 1}-${String(startMonth).padStart(2, '0')}-01`
export const fyEnd = (fy: number, startMonth: number) => {
  const s = new Date(fyStart(fy, startMonth) + 'T00:00:00')
  s.setFullYear(s.getFullYear() + 1)
  s.setDate(s.getDate() - 1)
  return `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}`
}
export const fyLabel = (fy: number, startMonth: number) => (startMonth === 1 ? `${fy}` : `${fy - 1}–${String(fy).slice(2)}`)

export const STATUS: Record<string, { label: string; tone: string }> = {
  awaiting_division: { label: 'Pending · division', tone: 'amber' },
  awaiting_finance: { label: 'Pending · finance', tone: 'amber' },
  awaiting_organizer: { label: 'Pending · organizer', tone: 'amber' },
  awaiting_verification: { label: 'Pending · verification', tone: 'amber' },
  approved: { label: 'Approved · unpaid', tone: 'blue' },
  paid: { label: 'Paid', tone: 'green' },
  posted: { label: 'Posted', tone: 'green' },
  returned: { label: 'Returned', tone: 'blue' },
  rejected: { label: 'Rejected', tone: 'red' },
  void: { label: 'Void', tone: 'gray' },
}
export const PENDING = ['awaiting_division', 'awaiting_finance', 'awaiting_organizer', 'awaiting_verification']
export const POSTED = ['approved', 'paid', 'posted']

export const TYPE_LABEL: Record<string, string> = {
  expense: 'Expense', income: 'Income', transfer: 'Transfer', advance: 'Cash advance',
  advance_return: 'Advance returned', sponsor_invoice: 'Sponsor invoice', opening: 'Opening balance',
}
export const METHOD_LABEL: Record<string, string> = {
  club: 'Paid from a club account', member: 'Paid by member – reimburse',
  invoice: 'Supplier invoice – not yet paid', deposit: 'Deposit / prepayment', advance: 'Paid from a cash advance',
}

/** +1 money in, -1 money out, 0 neutral (for colouring and monthly totals). */
export const direction = (type: string, inKind?: boolean) =>
  type === 'income' ? (inKind ? 0 : 1) : type === 'expense' ? -1 : 0

export function downloadCSV(name: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: any) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const csv = '﻿' + rows.map((r) => r.map(esc).join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  a.download = name.endsWith('.csv') ? name : name + '.csv'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
export const csvMoney = (c: number) => (Number(c || 0) / 100).toFixed(2)
