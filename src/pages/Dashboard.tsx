import React, { useEffect, useState } from 'react'
import { sb, errText } from '../lib/supabase'
import { useApp } from '../lib/app'
import { daysBetween, fmtDate, fyLabel, money, today } from '../lib/format'
import { Bar, Card, Empty, ErrorBox, Loading, Section } from '../components/ui'
import MonthlyFeed from '../components/MonthlyFeed'

export function FySelect({ fy, setFy }: { fy: number; setFy: (n: number) => void }) {
  const app = useApp()
  const m = app.settings?.fy_start_month || 7
  const opts = [app.currentFy + 1, app.currentFy, app.currentFy - 1, app.currentFy - 2]
  return (
    <select className="fy-select" aria-label="Financial year" value={fy} onChange={(e) => setFy(Number(e.target.value))}>
      {opts.map((y) => <option key={y} value={y}>FY {fyLabel(y, m)}</option>)}
    </select>
  )
}

export default function Dashboard() {
  const app = useApp()
  const [fy, setFy] = useState(app.currentFy)
  const [d, setD] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const m = app.settings?.fy_start_month || 7

  useEffect(() => {
    setD(null); setErr(null)
    sb.rpc('public_summary', { p_fy: fy }).then(({ data, error }) => (error ? setErr(errText(error)) : setD(data)))
  }, [fy, app.profile?.id])

  const share = async () => {
    const url = location.href.split('#')[0] + '#/'
    try {
      if ((navigator as any).share) await (navigator as any).share({ title: app.settings?.org_name + ' Finance', url })
      else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) }
    } catch { /* cancelled */ }
  }

  if (err?.startsWith('PRIVATE')) {
    return (
      <Card className="hero">
        <h1>{app.settings?.org_name} Finance</h1>
        <p>The dashboard is private right now. Committee members can still submit expenses and income.</p>
        <div className="row gap wrap">
          <a className="btn primary" href="#/add/expense">Submit expense</a>
          <a className="btn ghost" href="#/login/lead">Project Lead Login</a>
        </div>
      </Card>
    )
  }

  const surplus = d ? d.income_total - d.expense_total : 0
  const daysTo = d?.event_date ? daysBetween(today(), d.event_date) : null
  const s = d?.sponsorship

  return (
    <div className="stack">
      <Card className="hero">
        <h1>Welcome to the {app.settings?.org_name || 'TEDxVictoriaPeak'} Financial System</h1>
        <p>Submit expenses and report income for the organizing committee. Everyone can see where the money goes. <b className="accent-blue">Active period: FY {fyLabel(app.currentFy, m)}.</b></p>
        <div className="row gap wrap">
          <a className="btn primary" href="#/add/expense">Submit expense</a>
          <a className="btn ghost" href="#/add/income">Add income</a>
          {app.finAdmin && <button className="btn ghost" onClick={share}>{copied ? 'Link copied' : 'Share dashboard link'}</button>}
        </div>
      </Card>

      <div className="row between wrap gap">
        <FySelect fy={fy} setFy={setFy} />
        {d && <span className="muted small">Updated live from approved entries · {d.last_reconciled ? `bank last matched ${fmtDate(d.last_reconciled)}` : 'not reconciled yet'}</span>}
      </div>
      <ErrorBox msg={err} />
      {!d && !err && <Loading />}

      {d && (
        <>
          <div className="kpis">
            <Card className="kpi navy">
              <span className="kpi-label">Total cash · all accounts</span>
              <span className="kpi-value">{money(d.total_cash)}</span>
              <span className="kpi-sub">as of {fmtDate(d.today)}</span>
            </Card>
            <Card className="kpi">
              <span className="kpi-label">Net funds</span>
              <span className="kpi-value">{money(d.net_funds)}</span>
              <span className="kpi-sub">cash + owed to us − what we owe</span>
            </Card>
            <Card className="kpi">
              <span className="kpi-label">Income FY {fyLabel(d.fy, m)}</span>
              <span className="kpi-value green">{money(d.income_total, { sign: true })}</span>
            </Card>
            <Card className="kpi">
              <span className="kpi-label">Expenses FY {fyLabel(d.fy, m)}</span>
              <span className="kpi-value red">{money(-d.expense_total, { sign: true })}</span>
            </Card>
            <Card className="kpi">
              <span className="kpi-label">{surplus >= 0 ? 'Surplus' : 'Deficit'} so far</span>
              <span className={`kpi-value ${surplus >= 0 ? 'green' : 'red'}`}>{money(surplus)}</span>
            </Card>
            <Card className="kpi">
              <span className="kpi-label">{daysTo !== null ? 'Days to event' : 'Waiting for approval'}</span>
              <span className="kpi-value">{daysTo !== null ? (daysTo >= 0 ? daysTo : 'Done') : d.pending_count}</span>
              <span className="kpi-sub">{daysTo !== null ? fmtDate(d.event_date) : 'entries pending'}</span>
            </Card>
          </div>

          <div className="grid2">
            <Section title="Cash by account">
              <Card className="list">
                {d.cash_accounts.map((a: any) => (
                  <div key={a.name} className="list-row"><span>{a.name}</span><b>{money(a.balance)}</b></div>
                ))}
                <div className="list-row total"><span>Total cash</span><b>{money(d.total_cash)}</b></div>
              </Card>
            </Section>
            <Section title="Owed to us · we owe">
              <Card className="list">
                <div className="list-row"><span>Sponsor money still to receive</span><b className="green">{money(d.receivable)}</b></div>
                <div className="list-row"><span>Deposits paid in advance</span><b>{money(d.prepayments)}</b></div>
                <div className="list-row"><span>Cash advances with members</span><b>{money(d.advances)}</b></div>
                <div className="list-row"><span>Reimbursements owed to members</span><b className="red">{money(d.reimb_payable)}</b></div>
                <div className="list-row"><span>Unpaid supplier invoices</span><b className="red">{money(d.supplier_payable)}</b></div>
                <div className="list-row total"><span>Net funds</span><b>{money(d.net_funds)}</b></div>
              </Card>
            </Section>
          </div>

          <div className="grid2">
            <Section title="Budget used by division">
              <Card className="list">
                {d.divisions.length === 0 && <Empty>No divisions yet. A Project Lead can add them in Settings.</Empty>}
                {d.divisions.map((x: any) => (
                  <div key={x.name} className="budget-row">
                    <div className="row between"><b>{x.name}</b><span className="small muted">{money(x.actual + x.committed)} of {x.budget ? money(x.budget) : 'no budget'}</span></div>
                    <Bar value={x.actual + x.committed} max={x.budget} />
                    {x.committed > 0 && <span className="small muted">incl. {money(x.committed)} pending</span>}
                  </div>
                ))}
              </Card>
            </Section>
            <Section title="Sponsorship">
              <Card className="list">
                <div className="list-row"><span>Target</span><b>{s.target ? money(s.target) : 'Not set'}</b></div>
                <div className="list-row"><span>Agreed with sponsors</span><b>{money(s.committed)}</b></div>
                <div className="list-row"><span>Received (cash + in-kind)</span><b className="green">{money(s.received)}</b></div>
                {s.target > 0 && <Bar value={s.received} max={s.target} tone="green" />}
              </Card>
            </Section>
          </div>

          <div className="grid2">
            <Section title="Income by category">
              <Card className="list">
                {d.income_by_category.length === 0 && <Empty>No income yet.</Empty>}
                {d.income_by_category.map((x: any) => <div key={x.name} className="list-row"><span>{x.name}</span><b className="green">{money(x.amount)}</b></div>)}
              </Card>
            </Section>
            <Section title="Expenses by category">
              <Card className="list">
                {d.expense_by_category.length === 0 && <Empty>No expenses yet.</Empty>}
                {d.expense_by_category.map((x: any) => <div key={x.name} className="list-row"><span>{x.name}</span><b className="red">{money(x.amount)}</b></div>)}
              </Card>
            </Section>
          </div>

          <MonthlyFeed fy={fy} />
        </>
      )}
    </div>
  )
}
