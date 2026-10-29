import React, { useEffect, useMemo, useState } from 'react'
import { sb, errText } from '../lib/supabase'
import { useApp, Account } from '../lib/app'
import { csvMoney, daysBetween, downloadCSV, fmtDate, fyEnd, fyLabel, fyOf, fyStart, money, today } from '../lib/format'
import { Card, Empty, ErrorBox, Field, Loading } from '../components/ui'
import ReportPack from '../components/ReportPack'

type Line = { id: number; entry_id: string; ref: string; entry_type: string; title: string; line_date: string; account_id: string; account_code: string; account_name: string; account_type: string; is_cash: boolean; debit: number; credit: number; division_id: string | null; category_id: string | null; memo: string | null }

const REPORTS: [string, string][] = [
  ['ie', 'Income & Expenditure'],
  ['sofp', 'Statement of Financial Position'],
  ['cash', 'Cash flow summary'],
  ['bva', 'Budget vs Actual'],
  ['payables', 'Outstanding reimbursements & invoices'],
  ['gl', 'General ledger'],
  ['tb', 'Trial balance'],
]

const nat = (a: Account, dr: number, cr: number) => (['asset', 'expense'].includes(a.type) ? dr - cr : cr - dr)

export default function Reports() {
  const app = useApp()
  const m = app.settings?.fy_start_month || 7
  const [rep, setRep] = useState('ie')
  const [from, setFrom] = useState(fyStart(app.currentFy, m))
  const [to, setTo] = useState(today() < fyEnd(app.currentFy, m) ? today() : fyEnd(app.currentFy, m))
  const [lines, setLines] = useState<Line[] | null>(null)
  const [budgets, setBudgets] = useState<any[]>([])
  const [unpaid, setUnpaid] = useState<any[]>([])
  const [glAcc, setGlAcc] = useState('')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!app.staff) return
    sb.rpc('ledger_lines', { p_from: null, p_to: null }).then(({ data, error }) => (error ? setErr(errText(error)) : setLines(data as Line[])))
    sb.from('entries').select('*').eq('status', 'approved').order('posted_at').then(({ data }) => setUnpaid(data || []))
  }, [app.staff])
  const fy = fyOf(to, m)
  useEffect(() => { if (app.staff) sb.from('budgets').select('*').eq('fy', fy).then(({ data }) => setBudgets(data || [])) }, [fy, app.staff])

  const acc = (id: string) => app.accounts.find((a) => a.id === id)!
  const inPeriod = (l: Line) => l.line_date >= from && l.line_date <= to
  const upTo = (d: string) => (l: Line) => l.line_date <= d

  const sumBy = (filter: (l: Line) => boolean) => {
    const s: Record<string, { dr: number; cr: number }> = {}
    ;(lines || []).filter(filter).forEach((l) => { const x = (s[l.account_id] ||= { dr: 0, cr: 0 }); x.dr += l.debit; x.cr += l.credit })
    return s
  }

  const content = useMemo(() => {
    if (!lines) return null
    const periodTitle = `${fmtDate(from)} – ${fmtDate(to)}`

    if (rep === 'ie') {
      const s = sumBy(inPeriod)
      const budgetByAcc: Record<string, number> = {}
      budgets.forEach((b) => { const c = app.categories.find((x) => x.id === b.category_id); if (c) budgetByAcc[c.account_id] = (budgetByAcc[c.account_id] || 0) + b.amount })
      const inc = app.accounts.filter((a) => a.type === 'income').map((a) => ({ a, v: nat(a, s[a.id]?.dr || 0, s[a.id]?.cr || 0) })).filter((x) => x.v)
      const exp = app.accounts.filter((a) => a.type === 'expense').map((a) => ({ a, v: nat(a, s[a.id]?.dr || 0, s[a.id]?.cr || 0), b: budgetByAcc[a.id] || 0 })).filter((x) => x.v || x.b)
      const ti = inc.reduce((t, x) => t + x.v, 0), te = exp.reduce((t, x) => t + x.v, 0), tb = exp.reduce((t, x) => t + x.b, 0)
      const csv = [['Income & Expenditure', periodTitle], [], ['Income', 'Amount'], ...inc.map((x) => [x.a.name, csvMoney(x.v)]), ['Total income', csvMoney(ti)], [], ['Expenses', 'Actual', `Budget FY${fy}`], ...exp.map((x) => [x.a.name, csvMoney(x.v), csvMoney(x.b)]), ['Total expenses', csvMoney(te), csvMoney(tb)], [], [ti - te >= 0 ? 'Surplus' : 'Deficit', csvMoney(ti - te)]]
      return { csv, el: (
        <table className="table report">
          <thead><tr><th>Income</th><th className="num">Amount</th><th /></tr></thead>
          <tbody>
            {inc.map((x) => <tr key={x.a.id}><td>{x.a.name}</td><td className="num">{money(x.v)}</td><td /></tr>)}
            <tr className="total"><td>Total income</td><td className="num">{money(ti)}</td><td /></tr>
          </tbody>
          <thead><tr><th>Expenses</th><th className="num">Actual</th><th className="num">Budget FY {fyLabel(fy, m)}</th></tr></thead>
          <tbody>
            {exp.map((x) => <tr key={x.a.id}><td>{x.a.name}</td><td className="num">{money(x.v)}</td><td className="num muted">{money(x.b)}</td></tr>)}
            <tr className="total"><td>Total expenses</td><td className="num">{money(te)}</td><td className="num">{money(tb)}</td></tr>
            <tr className="grand"><td>{ti - te >= 0 ? 'Surplus' : 'Deficit'}</td><td className={`num ${ti - te >= 0 ? 'green' : 'red'}`}>{money(ti - te)}</td><td /></tr>
          </tbody>
        </table>) }
    }

    if (rep === 'sofp') {
      const s = sumBy(upTo(to))
      const bal = (a: Account) => nat(a, s[a.id]?.dr || 0, s[a.id]?.cr || 0)
      const assets = app.accounts.filter((a) => a.type === 'asset').map((a) => ({ a, v: bal(a) })).filter((x) => x.v || !x.a.archived)
      const liabs = app.accounts.filter((a) => a.type === 'liability').map((a) => ({ a, v: bal(a) })).filter((x) => x.v || !x.a.archived)
      const ta = assets.reduce((t, x) => t + x.v, 0), tl = liabs.reduce((t, x) => t + x.v, 0)
      const opening = app.accounts.filter((a) => a.type === 'fund').reduce((t, a) => t + bal(a), 0)
      const surplus = app.accounts.filter((a) => a.type === 'income').reduce((t, a) => t + bal(a), 0) - app.accounts.filter((a) => a.type === 'expense').reduce((t, a) => t + bal(a), 0)
      const csv = [['Statement of Financial Position', `as at ${to}`], [], ['Assets'], ...assets.map((x) => [x.a.name, csvMoney(x.v)]), ['Total assets', csvMoney(ta)], [], ['Liabilities'], ...liabs.map((x) => [x.a.name, csvMoney(x.v)]), ['Total liabilities', csvMoney(tl)], [], ['Net assets', csvMoney(ta - tl)], [], ['Funds'], ['Opening fund', csvMoney(opening)], ['Accumulated surplus/(deficit)', csvMoney(surplus)], ['Total funds', csvMoney(opening + surplus)]]
      return { csv, el: (
        <table className="table report">
          <thead><tr><th>Assets · as at {fmtDate(to)}</th><th className="num">HK$</th></tr></thead>
          <tbody>{assets.map((x) => <tr key={x.a.id}><td>{x.a.name}</td><td className="num">{money(x.v)}</td></tr>)}<tr className="total"><td>Total assets</td><td className="num">{money(ta)}</td></tr></tbody>
          <thead><tr><th>Liabilities</th><th /></tr></thead>
          <tbody>{liabs.map((x) => <tr key={x.a.id}><td>{x.a.name}</td><td className="num">{money(x.v)}</td></tr>)}<tr className="total"><td>Total liabilities</td><td className="num">{money(tl)}</td></tr>
            <tr className="grand"><td>Net assets</td><td className="num">{money(ta - tl)}</td></tr></tbody>
          <thead><tr><th>Funds</th><th /></tr></thead>
          <tbody><tr><td>Opening fund</td><td className="num">{money(opening)}</td></tr><tr><td>Accumulated surplus / (deficit)</td><td className="num">{money(surplus)}</td></tr>
            <tr className="grand"><td>Total funds</td><td className="num">{money(opening + surplus)}</td></tr></tbody>
          {ta - tl !== opening + surplus && <caption className="red">Warning: net assets and funds differ by {money(ta - tl - opening - surplus)}.</caption>}
        </table>) }
    }

    if (rep === 'cash') {
      const cashAcc = app.accounts.filter((a) => a.is_cash)
      const rows = cashAcc.map((a) => {
        const ls = lines.filter((l) => l.account_id === a.id)
        const open = ls.filter((l) => l.line_date < from).reduce((t, l) => t + l.debit - l.credit, 0)
        const p = ls.filter(inPeriod)
        const inn = p.reduce((t, l) => t + l.debit, 0), out = p.reduce((t, l) => t + l.credit, 0)
        return { a, open, inn, out, close: open + inn - out }
      })
      const T = rows.reduce((t, r) => ({ open: t.open + r.open, inn: t.inn + r.inn, out: t.out + r.out, close: t.close + r.close }), { open: 0, inn: 0, out: 0, close: 0 })
      const csv = [['Cash flow summary', periodTitle], ['Account', 'Opening', 'Money in', 'Money out', 'Closing'], ...rows.map((r) => [r.a.name, csvMoney(r.open), csvMoney(r.inn), csvMoney(r.out), csvMoney(r.close)]), ['Total', csvMoney(T.open), csvMoney(T.inn), csvMoney(T.out), csvMoney(T.close)]]
      return { csv, el: (
        <table className="table report">
          <thead><tr><th>Account</th><th className="num">Opening</th><th className="num">In</th><th className="num">Out</th><th className="num">Closing</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.a.id}><td>{r.a.name}</td><td className="num">{money(r.open)}</td><td className="num green">{money(r.inn)}</td><td className="num red">{money(r.out)}</td><td className="num">{money(r.close)}</td></tr>)}
            <tr className="total"><td>Total</td><td className="num">{money(T.open)}</td><td className="num">{money(T.inn)}</td><td className="num">{money(T.out)}</td><td className="num">{money(T.close)}</td></tr></tbody>
          <caption className="small muted">Transfers between your own accounts appear as both in and out.</caption>
        </table>) }
    }

    if (rep === 'bva') {
      const d0 = fyStart(fy, m), d1 = fyEnd(fy, m)
      const act: Record<string, number> = {}
      lines.filter((l) => l.account_type === 'expense' && l.line_date >= d0 && l.line_date <= d1).forEach((l) => { const k = `${l.division_id}|${l.category_id}`; act[k] = (act[k] || 0) + l.debit - l.credit })
      const keys = new Set([...budgets.map((b) => `${b.division_id}|${b.category_id}`), ...Object.keys(act)])
      const rows = Array.from(keys).map((k) => {
        const [d, c] = k.split('|'); const b = budgets.find((x) => x.division_id === d && x.category_id === c)?.amount || 0
        return { d: app.nameOf.division(d === 'null' ? null : d), c: app.nameOf.category(c === 'null' ? null : c), b, a: act[k] || 0 }
      }).sort((x, y) => x.d.localeCompare(y.d) || x.c.localeCompare(y.c))
      const csv = [[`Budget vs Actual FY${fy}`], ['Division', 'Category', 'Budget', 'Actual', 'Variance', '% used'], ...rows.map((r) => [r.d, r.c, csvMoney(r.b), csvMoney(r.a), csvMoney(r.b - r.a), r.b ? Math.round((r.a / r.b) * 100) + '%' : ''])]
      return { csv, el: (
        <table className="table report">
          <thead><tr><th>Division</th><th>Category</th><th className="num">Budget</th><th className="num">Actual</th><th className="num">Variance</th><th className="num">Used</th></tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}><td>{r.d}</td><td>{r.c}</td><td className="num">{money(r.b)}</td><td className="num">{money(r.a)}</td><td className={`num ${r.b - r.a < 0 ? 'red' : ''}`}>{money(r.b - r.a)}</td><td className="num">{r.b ? Math.round((r.a / r.b) * 100) + '%' : '—'}</td></tr>)}</tbody>
          <caption className="small muted">Full financial year {fyLabel(fy, m)}. Pending items are on the Budget page.</caption>
        </table>) }
    }

    if (rep === 'payables') {
      const rows = unpaid.map((e) => ({ e, age: daysBetween((e.posted_at || e.created_at).slice(0, 10), today()) }))
      const csv = [['Outstanding reimbursements & supplier invoices', `as at ${today()}`], ['Reference', 'Type', 'Payee / member', 'Title', 'Approved on', 'Days waiting', 'Amount'], ...rows.map(({ e, age }) => [e.ref, e.method === 'member' ? 'Reimbursement' : 'Supplier invoice', e.payee || e.submitter_name, e.title, (e.posted_at || '').slice(0, 10), age, csvMoney(e.amount)])]
      return { csv, el: rows.length === 0 ? <Empty>Nothing outstanding.</Empty> : (
        <table className="table report">
          <thead><tr><th>Ref</th><th>Type</th><th>Payee / member</th><th>Title</th><th className="num">Days</th><th className="num">Amount</th></tr></thead>
          <tbody>{rows.map(({ e, age }) => <tr key={e.id}><td>{e.ref}</td><td>{e.method === 'member' ? 'Reimbursement' : 'Supplier invoice'}</td><td>{e.payee || e.submitter_name}</td><td>{e.title}</td><td className={`num ${age > 14 ? 'red' : ''}`}>{age}</td><td className="num">{money(e.amount)}</td></tr>)}
            <tr className="total"><td colSpan={5}>Total</td><td className="num">{money(rows.reduce((t, r) => t + r.e.amount, 0))}</td></tr></tbody>
        </table>) }
    }

    if (rep === 'gl') {
      const a = glAcc ? acc(glAcc) : null
      if (!a) return { csv: [], el: <Empty>Choose an account.</Empty> }
      const ls = lines.filter((l) => l.account_id === a.id)
      const open = ls.filter((l) => l.line_date < from).reduce((t, l) => t + nat(a, l.debit, l.credit), 0)
      let run = open
      const rows = ls.filter(inPeriod).map((l) => { run += nat(a, l.debit, l.credit); return { l, run } })
      const csv = [[`General ledger: ${a.code} ${a.name}`, periodTitle], ['Date', 'Reference', 'Description', 'Debit', 'Credit', 'Balance'], ['', '', 'Opening balance', '', '', csvMoney(open)], ...rows.map(({ l, run }) => [l.line_date, l.ref, l.memo || l.title, l.debit ? csvMoney(l.debit) : '', l.credit ? csvMoney(l.credit) : '', csvMoney(run)])]
      return { csv, el: (
        <div className="table-wrap"><table className="table report">
          <thead><tr><th>Date</th><th>Ref</th><th>Description</th><th className="num">Debit</th><th className="num">Credit</th><th className="num">Balance</th></tr></thead>
          <tbody><tr className="muted"><td colSpan={5}>Opening balance</td><td className="num">{money(open)}</td></tr>
            {rows.map(({ l, run }) => <tr key={l.id}><td className="nowrap">{fmtDate(l.line_date)}</td><td>{l.ref}</td><td>{l.memo || l.title}</td><td className="num">{l.debit ? money(l.debit) : ''}</td><td className="num">{l.credit ? money(l.credit) : ''}</td><td className="num">{money(run)}</td></tr>)}
            <tr className="total"><td colSpan={5}>Closing balance</td><td className="num">{money(run)}</td></tr></tbody>
        </table></div>) }
    }

    // trial balance
    const s = sumBy(upTo(to))
    const rows = app.accounts.map((a) => { const net = (s[a.id]?.dr || 0) - (s[a.id]?.cr || 0); return { a, dr: net > 0 ? net : 0, cr: net < 0 ? -net : 0 } }).filter((r) => r.dr || r.cr)
    const tdr = rows.reduce((t, r) => t + r.dr, 0), tcr = rows.reduce((t, r) => t + r.cr, 0)
    const csv = [['Trial balance', `as at ${to}`], ['Code', 'Account', 'Debit', 'Credit'], ...rows.map((r) => [r.a.code, r.a.name, r.dr ? csvMoney(r.dr) : '', r.cr ? csvMoney(r.cr) : '']), ['', 'Total', csvMoney(tdr), csvMoney(tcr)]]
    return { csv, el: (
      <table className="table report">
        <thead><tr><th>Code</th><th>Account</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.a.id}><td>{r.a.code}</td><td>{r.a.name}</td><td className="num">{r.dr ? money(r.dr) : ''}</td><td className="num">{r.cr ? money(r.cr) : ''}</td></tr>)}
          <tr className="grand"><td /><td>Total</td><td className="num">{money(tdr)}</td><td className="num">{money(tcr)}</td></tr></tbody>
        <caption className={tdr === tcr ? 'green small' : 'red small'}>{tdr === tcr ? 'Balanced: debits equal credits.' : `Out of balance by ${money(tdr - tcr)}.`}</caption>
      </table>) }
  }, [lines, rep, from, to, budgets, unpaid, glAcc, app.accounts, app.categories])

  if (!app.staff) return <Card className="hero"><h1>Reports</h1><p>Log in to see the full reports.</p></Card>

  const title = REPORTS.find((r) => r[0] === rep)![1]
  const needsFrom = ['ie', 'cash', 'gl'].includes(rep)

  return (
    <div className="stack">
      <h1 className="page-title no-print">Reports</h1>
      <ReportPack />
      <div className="filters no-print">
        <select value={rep} onChange={(e) => setRep(e.target.value)} aria-label="Report">{REPORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        {needsFrom && <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>}
        <Field label={needsFrom ? 'To' : 'As at'}><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        {rep === 'gl' && <Field label="Account"><select value={glAcc} onChange={(e) => setGlAcc(e.target.value)}><option value="">Choose…</option>{app.accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select></Field>}
      </div>
      <ErrorBox msg={err} />
      {!lines && !err && <Loading />}
      {content && (
        <Card className="report-card">
          <div className="row between wrap gap">
            <div><h2 className="report-title">{title}</h2><span className="small muted">{app.settings?.org_name} · {needsFrom ? `${fmtDate(from)} – ${fmtDate(to)}` : `as at ${fmtDate(to)}`} · HKD</span></div>
            <div className="row gap no-print">
              <button className="btn ghost small-btn" onClick={() => downloadCSV(`${title} ${to}`, content.csv)}>Excel (CSV)</button>
              <button className="btn ghost small-btn" onClick={() => window.print()}>Print / PDF</button>
            </div>
          </div>
          <div className="table-wrap">{content.el}</div>
        </Card>
      )}
    </div>
  )
}
