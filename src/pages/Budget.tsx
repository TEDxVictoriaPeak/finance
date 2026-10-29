import React, { useEffect, useMemo, useState } from 'react'
import { sb, errText } from '../lib/supabase'
import { useApp } from '../lib/app'
import { PENDING, centsToInput, csvMoney, downloadCSV, fmtDateTime, fyEnd, fyStart, money, parseMoney } from '../lib/format'
import { Bar, Card, Empty, ErrorBox, Field, Loading, Modal, Section } from '../components/ui'
import { FySelect } from './Dashboard'

export default function Budget() {
  const app = useApp()
  const m = app.settings?.fy_start_month || 7
  const [fy, setFy] = useState(app.currentFy)
  const [budgets, setBudgets] = useState<any[] | null>(null)
  const [actual, setActual] = useState<Record<string, number>>({})
  const [committed, setCommitted] = useState<Record<string, number>>({})
  const [history, setHistory] = useState<any[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [edit, setEdit] = useState<{ div: string; cat: string; amount: number } | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!app.staff) return
    setBudgets(null)
    const d0 = fyStart(fy, m), d1 = fyEnd(fy, m)
    Promise.all([
      sb.from('budgets').select('*').eq('fy', fy),
      sb.rpc('ledger_lines', { p_from: d0, p_to: d1 }),
      sb.from('entries').select('division_id,category_id,amount,status,method,recognized_at').eq('type', 'expense').gte('txn_date', d0).lte('txn_date', d1),
      sb.from('budget_changes').select('*').eq('fy', fy).order('at', { ascending: false }).limit(50),
    ]).then(([b, l, e, h]) => {
      if (b.error || l.error || e.error) return setErr(errText(b.error || l.error || e.error))
      const a: Record<string, number> = {}
      ;(l.data as any[]).filter((x) => x.account_type === 'expense').forEach((x) => {
        const k = `${x.division_id}|${x.category_id}`; a[k] = (a[k] || 0) + x.debit - x.credit
      })
      const c: Record<string, number> = {}
      ;(e.data as any[]).filter((x) => PENDING.includes(x.status) || (x.method === 'deposit' && x.status === 'paid' && !x.recognized_at)).forEach((x) => {
        const k = `${x.division_id}|${x.category_id}`; c[k] = (c[k] || 0) + x.amount
      })
      setActual(a); setCommitted(c); setBudgets(b.data || []); setHistory(h.data || [])
    })
  }, [fy, app.staff, tick])

  const expenseCats = app.categories.filter((c) => c.kind === 'expense')
  const divisions = app.divisions

  const table = useMemo(() => {
    if (!budgets) return []
    return divisions.map((d) => {
      const rows = expenseCats.map((c) => {
        const k = `${d.id}|${c.id}`
        const b = budgets.find((x) => x.division_id === d.id && x.category_id === c.id)?.amount || 0
        return { cat: c, budget: b, actual: actual[k] || 0, committed: committed[k] || 0 }
      }).filter((r) => (!r.cat.archived && !d.archived) || r.budget || r.actual || r.committed)
      const tot = rows.reduce((s, r) => ({ budget: s.budget + r.budget, actual: s.actual + r.actual, committed: s.committed + r.committed }), { budget: 0, actual: 0, committed: 0 })
      return { div: d, rows, tot }
    }).filter((x) => !x.div.archived || x.tot.budget || x.tot.actual)
  }, [budgets, actual, committed, divisions, expenseCats])

  if (!app.staff) return <Card className="hero"><h1>Budget</h1><p>The budget summary is on the dashboard. Log in to see the full budget.</p></Card>

  const exportCsv = () => downloadCSV(`budget-FY${fy}`, [
    ['Division', 'Category', 'Budget', 'Actual', 'Pending/committed', 'Available'],
    ...table.flatMap((t) => t.rows.map((r) => [t.div.name, r.cat.name, csvMoney(r.budget), csvMoney(r.actual), csvMoney(r.committed), csvMoney(r.budget - r.actual - r.committed)])),
  ])

  return (
    <div className="stack">
      <div className="row between wrap gap">
        <h1 className="page-title">Budget</h1>
        <div className="row gap"><FySelect fy={fy} setFy={setFy} /><button className="btn ghost small-btn" onClick={exportCsv}>Export</button></div>
      </div>
      <p className="muted small">Available = Budget − Actual − Pending. Tap a budget amount to change it. Every change is logged with a reason. Divisions and categories are managed in Settings.</p>
      <ErrorBox msg={err} />
      {!budgets && !err && <Loading />}
      {budgets && divisions.length === 0 && <Empty>Add divisions and expense categories in Settings first.</Empty>}

      {table.map(({ div, rows, tot }) => (
        <Section key={div.id} title={div.name} right={<span className="small muted">{money(tot.actual + tot.committed)} of {money(tot.budget)}</span>}>
          <Card>
            <Bar value={tot.actual + tot.committed} max={tot.budget} />
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Category</th><th className="num">Budget</th><th className="num">Actual</th><th className="num">Pending</th><th className="num">Available</th></tr></thead>
                <tbody>
                  {rows.map((r) => {
                    const avail = r.budget - r.actual - r.committed
                    return (
                      <tr key={r.cat.id}>
                        <td>{r.cat.name}{r.cat.archived ? ' (archived)' : ''}</td>
                        <td className="num"><button className="link-btn" onClick={() => setEdit({ div: div.id, cat: r.cat.id, amount: r.budget })}>{money(r.budget)}</button></td>
                        <td className="num">{money(r.actual)}</td>
                        <td className="num">{money(r.committed)}</td>
                        <td className={`num ${avail < 0 ? 'red' : r.budget && avail < r.budget * 0.2 ? 'amber' : ''}`}>{money(avail)}</td>
                      </tr>
                    )
                  })}
                  <tr className="total"><td>Total</td><td className="num">{money(tot.budget)}</td><td className="num">{money(tot.actual)}</td><td className="num">{money(tot.committed)}</td><td className="num">{money(tot.budget - tot.actual - tot.committed)}</td></tr>
                </tbody>
              </table>
            </div>
          </Card>
        </Section>
      ))}

      <Section title="Budget change history">
        <Card className="list">
          {history.length === 0 && <Empty>No changes yet.</Empty>}
          {history.map((h) => (
            <div key={h.id} className="list-row">
              <span className="grow">
                <span className="block">{app.nameOf.division(h.division_id)} · {app.nameOf.category(h.category_id)}: {h.old_amount === null ? 'set to' : `${money(h.old_amount)} →`} {money(h.new_amount)}</span>
                <span className="small muted">{h.actor_name} · {fmtDateTime(h.at)}{h.reason ? ` · “${h.reason}”` : ''}</span>
              </span>
            </div>
          ))}
        </Card>
      </Section>

      {edit && <EditBudget fy={fy} {...edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); setTick(tick + 1) }} />}
    </div>
  )
}

function EditBudget({ fy, div, cat, amount, onClose, onSaved }: { fy: number; div: string; cat: string; amount: number; onClose: () => void; onSaved: () => void }) {
  const app = useApp()
  const [val, setVal] = useState(centsToInput(amount) || '0.00')
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const save = async () => {
    const c = parseMoney(val)
    if (c === null || c < 0) return setErr('Enter a valid amount.')
    if (!reason.trim()) return setErr('Please give a reason for the change.')
    const { error } = await sb.rpc('set_budget', { p_fy: fy, p_div: div, p_cat: cat, p_amount: c, p_reason: reason.trim() })
    if (error) setErr(errText(error)); else onSaved()
  }
  return (
    <Modal title="Change budget" onClose={onClose}>
      <p className="muted">{app.nameOf.division(div)} · {app.nameOf.category(cat)}</p>
      <Field label="Budget (HK$)"><input inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} /></Field>
      <Field label="Reason"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Approved in committee meeting 3 Nov" /></Field>
      <ErrorBox msg={err} />
      <div className="row gap end"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></div>
    </Modal>
  )
}
