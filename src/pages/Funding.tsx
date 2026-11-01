import React, { useEffect, useState } from 'react'
import { sb, errText } from '../lib/supabase'
import { Funding, hk } from '../lib/store'
import { fmtDate, today } from '../lib/format'
import { Card, Empty, ErrorBox, Field, Section, useDialog } from '../components/ui'

const KINDS: [string, string][] = [['club', 'Club underwriting'], ['sponsor', 'Sponsor'], ['ticket', 'Ticket sales'], ['other', 'Other']]

export default function FundingPage() {
  const dlg = useDialog()
  const [list, setList] = useState<Funding[]>([])
  const [f, setF] = useState({ kind: 'club', source: '', amount: '', received_on: today(), note: '' })
  const [err, setErr] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => { sb.from('funding').select('*').order('received_on').then(({ data, error }) => (error ? setErr(errText(error)) : setList((data as Funding[]) || []))) }, [tick])
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value })

  const add = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null)
    const amount = Number(String(f.amount).replace(/[^0-9.]/g, ''))
    if (!amount) return setErr('Enter the amount.')
    const source = f.source.trim() || KINDS.find((k) => k[0] === f.kind)![1]
    const { error } = await sb.from('funding').insert({ kind: f.kind, source, amount, received_on: f.received_on || null, note: f.note.trim() || null })
    if (error) return setErr(errText(error))
    setF({ ...f, source: '', amount: '', note: '' }); setTick(tick + 1)
  }
  const del = async (x: Funding) => {
    const ok = await dlg.ask({ title: 'Delete this funding line?', message: `${x.source} · ${hk(x.amount)}`, input: false, confirmText: 'Delete', danger: true })
    if (!ok) return
    const { error } = await sb.from('funding').delete().eq('id', x.id)
    if (error) setErr(errText(error)); else setTick(tick + 1)
  }
  const total = list.reduce((t, x) => t + Number(x.amount), 0)

  return (
    <div className="stack narrow">
      <h1 className="page-title">Funding</h1>
      <p className="muted small">Money that pays for the project: the club's underwriting, sponsors, ticket sales. The report compares this with total expenses.</p>
      <Section title={`Received · ${hk(total)}`}>
        <Card className="list">
          {list.length === 0 && <Empty>Nothing recorded yet.</Empty>}
          {list.map((x) => (
            <div key={x.id} className="list-row">
              <span className="grow"><span className="block"><b>{x.source}</b></span><span className="small muted">{KINDS.find((k) => k[0] === x.kind)?.[1]}{x.received_on ? ` · ${fmtDate(x.received_on)}` : ''}{x.note ? ` · ${x.note}` : ''}</span></span>
              <b className="green">{hk(x.amount)}</b>
              <button className="icon-btn" aria-label="Delete" onClick={() => del(x)}>×</button>
            </div>
          ))}
        </Card>
      </Section>
      <Section title="Add funding">
        <Card>
          <form className="stack" onSubmit={add}>
            <div className="grid2 tight">
              <Field label="Type"><select value={f.kind} onChange={set('kind')}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
              <Field label="Amount (HK$)"><input inputMode="decimal" value={f.amount} onChange={set('amount')} placeholder="0.00" /></Field>
              <Field label="From (name)"><input value={f.source} onChange={set('source')} placeholder="e.g. RC Neoteric HK / sponsor name" /></Field>
              <Field label="Date received"><input type="date" value={f.received_on} onChange={set('received_on')} /></Field>
            </div>
            <Field label="Note (optional)"><input value={f.note} onChange={set('note')} /></Field>
            <ErrorBox msg={err} />
            <button className="btn primary">Add</button>
          </form>
        </Card>
      </Section>
    </div>
  )
}
