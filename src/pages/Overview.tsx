import React, { useEffect, useState } from 'react'
import { sb, errText } from '../lib/supabase'
import { hk, useStore } from '../lib/store'
import { Card, Empty, ErrorBox, Loading, Section } from '../components/ui'

type Pub = { private: boolean; project_name: string; club_name: string; items?: any[]; funding_total?: number; funding_by_kind?: Record<string, number>; promised_total?: number }

export default function Overview() {
  const s = useStore()
  const [d, setD] = useState<Pub | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { sb.rpc('simple_public').then(({ data, error }) => (error ? setErr(errText(error)) : setD(data as Pub))) }, [s.staff])

  if (err) return <ErrorBox msg={err} />
  if (!d) return <Loading />
  if (d.private) {
    return (
      <Card className="hero">
        <h1>{d.project_name} · Finance</h1>
        <p>The finance overview is private. Please log in.</p>
        <a className="btn primary" href="#/login">Log in</a>
      </Card>
    )
  }

  const items = d.items || []
  const total = items.reduce((t, i) => t + Number(i.amount), 0)
  const funding = Number(d.funding_total || 0)
  const promised = Number(d.promised_total || 0)
  const kinds = ([['sponsor', 'Sponsors'], ['club', 'Club underwriting'], ['ticket', 'Ticket sales'], ['other', 'Other']] as const).map(([k, l]) => ({ k, l, sum: Number(d.funding_by_kind?.[k] || 0) })).filter((x) => x.sum)
  const balance = funding - total
  const missing = items.filter((i) => !i.has_proof).length
  const byCat = s.categories.map((c) => {
    const list = items.filter((i) => i.category_id === c.id)
    return { c, n: list.length, sum: list.reduce((t, i) => t + Number(i.amount), 0) }
  })

  return (
    <div className="stack">
      <Card className="hero">
        <h1>{d.project_name}</h1>
        <p>{d.club_name} · Income and expenses, updated as soon as an item is added.</p>
        {s.staff && <div className="row gap wrap"><a className="btn primary" href="#/add">Add expense</a><a className="btn ghost" href="#/report">See report</a></div>}
      </Card>

      <div className="kpis">
        <Card className="kpi navy"><span className="kpi-label">Total expenses</span><span className="kpi-value">{hk(total)}</span><span className="kpi-sub">{items.length} items</span></Card>
        <Card className="kpi"><span className="kpi-label">Income received</span><span className="kpi-value green">{hk(funding)}</span><span className="kpi-sub">{promised > 0 ? `+ ${hk(promised)} promised, not yet paid` : 'sponsors, club, tickets'}</span></Card>
        <Card className="kpi"><span className="kpi-label">{balance >= 0 ? 'Remaining' : 'Short by'}</span><span className={`kpi-value ${balance >= 0 ? 'green' : 'red'}`}>{hk(Math.abs(balance))}</span><span className="kpi-sub">income received − expenses</span></Card>
      </div>
      {s.staff && missing > 0 && <div className="info">{missing} item{missing > 1 ? 's are' : ' is'} missing a payment proof screenshot. <a href="#/expenses">Check expenses</a></div>}

      <Section title="Income">
        <Card className="list">
          {kinds.length === 0 && promised === 0 && <Empty>No income recorded yet.</Empty>}
          {kinds.map((x) => <div key={x.k} className="list-row"><span className="grow">{x.l}</span><b>{hk(x.sum)}</b></div>)}
          {kinds.length > 0 && <div className="list-row total"><span>Total income received</span><b className="green">{hk(funding)}</b></div>}
          {promised > 0 && <div className="list-row"><span className="grow amber">Promised, not yet paid <span className="small muted">(not counted in the balance)</span></span><b className="amber">{hk(promised)}</b></div>}
        </Card>
      </Section>

      <Section title="Expenses by category">
        <Card className="list">
          {byCat.map(({ c, n, sum }) => (
            <div key={c.id} className="list-row">
              <span className="grow"><b className="cat-letter">{c.letter}</b> {c.name}<span className="small muted"> · {n} item{n === 1 ? '' : 's'}</span></span>
              <b>{hk(sum)}</b>
            </div>
          ))}
          <div className="list-row total"><span>Total expenses</span><b>{hk(total)}</b></div>
        </Card>
      </Section>

      <Section title="All items">
        <Card className="list">
          {items.length === 0 && <Empty>No expenses yet.</Empty>}
          {items.map((i) => (
            <div key={i.code} className="list-row">
              <span className="code-pill">{i.code}</span>
              <span className="grow">{i.description}</span>
              {!i.has_proof && s.staff && <span className="badge amber">No proof</span>}
              <b>{hk(i.amount)}</b>
            </div>
          ))}
        </Card>
      </Section>
    </div>
  )
}
