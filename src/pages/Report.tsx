import React, { useEffect, useState } from 'react'
import { sb, errText } from '../lib/supabase'
import { Funding, hk, Item, num, useStore } from '../lib/store'
import { fmtDate, today } from '../lib/format'
import { writeXlsx } from '../lib/xlsx.js'
import { Card, ErrorBox, Loading } from '../components/ui'

const KIND: Record<string, string> = { club: 'Amount (Balance) Underwritten by Club', sponsor: 'Sponsorship', ticket: 'Ticket sales', other: 'Other income' }

export default function Report() {
  const s = useStore()
  const [items, setItems] = useState<Item[] | null>(null)
  const [allIncome, setAllIncome] = useState<Funding[]>([])
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([sb.from('exp_items').select('*'), sb.from('funding').select('*').order('received_on')]).then(([a, b]) => {
      if (a.error || b.error) return setErr(errText(a.error || b.error))
      setItems((a.data as Item[]) || []); setAllIncome((b.data as Funding[]) || [])
    })
  }, [])

  if (err) return <ErrorBox msg={err} />
  if (!items) return <Loading />

  const groups = s.categories.map((c) => {
    const list = items.filter((i) => i.category_id === c.id).sort((a, b) => a.seq - b.seq)
    return { c, list, sum: list.reduce((t, i) => t + Number(i.amount), 0) }
  }).filter((g) => g.list.length)
  const total = groups.reduce((t, g) => t + g.sum, 0)
  const funding = allIncome.filter((f) => f.status !== 'promised')
  const promisedList = allIncome.filter((f) => f.status === 'promised')
  const promised = promisedList.reduce((t, f) => t + Number(f.amount), 0)
  const kinds = ['club', 'sponsor', 'ticket', 'other'].map((k) => ({ k, sum: funding.filter((f) => f.kind === k).reduce((t, f) => t + Number(f.amount), 0) })).filter((x) => x.sum)
  const fTotal = kinds.reduce((t, x) => t + x.sum, 0)
  const balance = fTotal - total

  const exportXlsx = () => {
    const H = (l: string[]) => l.map((v) => ({ v, s: 'head' }))
    const rows: any[][] = [
      [{ v: 'Service Project Financials', s: 'title' }],
      [{ v: 'Club Name: ' + (s.project?.club_name || ''), s: 'bold' }],
      [{ v: 'Project Name: ' + (s.project?.project_name || ''), s: 'bold' }],
      [{ v: 'Currency: HKD · prepared ' + fmtDate(today()), s: 'sub' }],
      [],
      H(['EXPENSE (itemized)', 'Final Report Actual (HK$)', 'Breakdown (HK$)', 'Payment Proof', 'Remarks']),
    ]
    const subRows: number[] = []
    groups.forEach((g) => {
      const head = rows.length + 1
      const first = head + 1, last = head + g.list.length
      subRows.push(head)
      rows.push([{ v: g.c.name, s: 'section' }, { f: `SUM(C${first}:C${last})`, s: 'moneyB' }, { v: '', s: 'section' }, { v: '', s: 'section' }, { v: '', s: 'section' }])
      g.list.forEach((i) => rows.push(['   - ' + i.description, '', { v: Number(i.amount), s: 'money' }, s.code(i), i.remarks || '']))
    })
    rows.push([])
    const totalRow = rows.length + 1
    rows.push([{ v: 'TOTAL EXPENSES', s: 'labelT' }, { f: subRows.length ? subRows.map((r) => 'B' + r).join('+') : '0', s: 'moneyT' }])
    rows.push([])
    const fRows: number[] = []
    funding.forEach((f) => { fRows.push(rows.length + 1); rows.push([(KIND[f.kind] || f.kind) + (f.source ? ' – ' + f.source : ''), { v: Number(f.amount), s: 'money' }, '', '', f.note || '']) })
    const fTotRow = rows.length + 1
    rows.push([{ v: 'TOTAL INCOME RECEIVED', s: 'labelT' }, { f: fRows.length ? `SUM(B${fRows[0]}:B${fRows[fRows.length - 1]})` : '0', s: 'moneyT' }])
    rows.push([{ v: 'BALANCE (income received − expenses)', s: 'labelG' }, { f: `B${fTotRow}-B${totalRow}`, s: 'moneyG' }])
    if (promised) rows.push([{ v: 'Promised, not yet paid (not included above)', s: 'sub' }, { v: promised, s: 'money' }])
    rows.push([])
    rows.push([{ v: '** Payment proof means evidence of the amount paid (an invoice or estimate alone is not proof). Each code (A1, A2 …) matches an item sheet.', s: 'note' }])

    const detail: any[][] = [H(['Code', 'Category', 'Description', 'Purpose', 'Purchased item', 'Supplier', 'Date(s) of purchase', 'Submitted by', 'Date of submission', 'Amount (HK$)', 'Proof files', 'Remarks'])]
    groups.forEach((g) => g.list.forEach((i) => detail.push([s.code(i), g.c.name, i.description, i.purpose || '', i.purchased_item || '', i.supplier || '',
      (i.purchase_dates || []).map(fmtDate).join(', '), i.submitted_by || '', i.submitted_on ? { v: i.submitted_on, s: 'date' } : '', { v: Number(i.amount), s: 'money' }, (i.proof_paths || []).length, i.remarks || ''])))
    const fund: any[][] = [H(['Status', 'Type', 'Source', 'Date received / expected', 'Amount (HK$)', 'Note'])]
    allIncome.forEach((f) => fund.push([f.status === 'promised' ? 'Promised' : 'Received', KIND[f.kind] || f.kind, f.source, f.received_on ? { v: f.received_on, s: 'date' } : '', { v: Number(f.amount), s: 'money' }, f.note || '']))

    const bytes = writeXlsx([
      { name: 'Financials', freeze: 6, widths: [52, 20, 16, 14, 40], rows },
      { name: 'Items', freeze: 1, widths: [8, 34, 40, 28, 22, 18, 24, 18, 14, 14, 10, 30], rows: detail },
      { name: 'Income', freeze: 1, widths: [12, 34, 30, 16, 16, 30], rows: fund },
    ])
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    a.download = `${(s.project?.project_name || 'Project').replace(/[^\w]+/g, '-')}-Financials-${today()}.xlsx`
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  return (
    <div className="stack">
      <div className="row between wrap gap no-print">
        <h1 className="page-title">Report</h1>
        <div className="row gap">
          <button className="btn ghost small-btn" onClick={() => window.print()}>Print / PDF</button>
          <button className="btn primary small-btn" onClick={exportXlsx}>Download Excel</button>
        </div>
      </div>
      <p className="muted small no-print">Same layout as the club's Service Project Financials. The Excel file also has an "Items" tab with every detail and an "Income" tab, and opens in Google Sheets.</p>
      <Card className="report-card">
        <div>
          <h2 className="report-title">Service Project Financials</h2>
          <div className="small">Club Name: <b>{s.project?.club_name}</b></div>
          <div className="small">Project Name: <b>{s.project?.project_name}</b></div>
        </div>
        <div className="table-wrap">
          <table className="table report fin">
            <thead><tr><th>Expense (itemized)</th><th className="num">Final Report Actual HK$</th><th className="num">Breakdown HK$</th><th>Payment Proof</th><th>Remarks</th></tr></thead>
            <tbody>
              {groups.map((g) => (
                <React.Fragment key={g.c.id}>
                  <tr className="cat-row"><td>{g.c.name}</td><td className="num">{num(g.sum)}</td><td /><td /><td /></tr>
                  {g.list.map((i) => (
                    <tr key={i.id} className="click" onClick={() => (location.hash = `#/item/${i.id}`)}>
                      <td className="indent">– {i.description}</td><td /><td className="num">{num(i.amount)}</td><td><span className="code-pill">{s.code(i)}</span></td><td className="small">{i.remarks}</td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
              <tr className="grand"><td>TOTAL EXPENSES</td><td className="num">{num(total)}</td><td /><td /><td /></tr>
              {kinds.map((x) => <tr key={x.k}><td>{KIND[x.k]}</td><td className="num">{num(x.sum)}</td><td /><td /><td /></tr>)}
              {kinds.length > 0 && <tr className="total"><td>Total income received</td><td className="num">{num(fTotal)}</td><td /><td /><td /></tr>}
              <tr className="total"><td>{balance >= 0 ? 'Balance remaining' : 'Shortfall (expenses not yet covered)'}</td><td className={`num ${balance >= 0 ? 'green' : 'red'}`}>{num(Math.abs(balance))}</td><td /><td /><td /></tr>
              {promised > 0 && <tr className="small"><td className="amber">Promised, not yet paid ({promisedList.length}) · not included above</td><td className="num amber">{num(promised)}</td><td /><td /><td /></tr>}
            </tbody>
          </table>
        </div>
        <p className="small muted">** Payment proof means evidence of the amount paid (an invoice or estimate alone is not proof). Each code links to its item sheet.</p>
        {groups.length === 0 && <p className="muted">No expense items yet.</p>}
      </Card>
      <p className="small muted no-print">Total {hk(total)} · {items.length} items</p>
    </div>
  )
}
