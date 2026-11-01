import React, { useEffect, useState } from 'react'
import { sb, errText } from '../lib/supabase'
import { Funding, hk } from '../lib/store'
import { fmtDate, today } from '../lib/format'
import { Card, Empty, ErrorBox, Field, Section, useDialog } from '../components/ui'

export const KINDS: [string, string][] = [['sponsor', 'Sponsor'], ['club', 'Club underwriting'], ['ticket', 'Ticket sales'], ['other', 'Other']]
const kindName = (k: string) => KINDS.find((x) => x[0] === k)?.[1] || k
const isPromised = (x: Funding) => x.status === 'promised'

export default function IncomePage() {
  const dlg = useDialog()
  const [list, setList] = useState<Funding[]>([])
  const [f, setF] = useState({ status: 'received', kind: 'sponsor', source: '', amount: '', received_on: today(), note: '' })
  const [err, setErr] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => { sb.from('funding').select('*').order('received_on').then(({ data, error }) => (error ? setErr(errText(error)) : setList((data as Funding[]) || []))) }, [tick])
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value })
  const promisedMode = f.status === 'promised'

  const add = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null)
    const amount = Number(String(f.amount).replace(/[^0-9.]/g, ''))
    if (!amount) return setErr('Enter the amount.')
    const source = f.source.trim() || kindName(f.kind)
    const { error } = await sb.from('funding').insert({ status: f.status, kind: f.kind, source, amount, received_on: f.received_on || null, note: f.note.trim() || null })
    if (error) return setErr(errText(error))
    setF({ ...f, source: '', amount: '', note: '' }); setTick(tick + 1)
  }
  const markReceived = async (x: Funding) => {
    const ok = await dlg.ask({ title: 'Mark as received?', message: `${x.source} · ${hk(x.amount)} has been paid into our account today.`, input: false, confirmText: 'Mark received' })
    if (!ok) return
    const { error } = await sb.from('funding').update({ status: 'received', received_on: today() }).eq('id', x.id)
    if (error) setErr(errText(error)); else setTick(tick + 1)
  }
  const del = async (x: Funding) => {
    const ok = await dlg.ask({ title: 'Delete this income line?', message: `${x.source} · ${hk(x.amount)}`, input: false, confirmText: 'Delete', danger: true })
    if (!ok) return
    const { error } = await sb.from('funding').delete().eq('id', x.id)
    if (error) setErr(errText(error)); else setTick(tick + 1)
  }

  const received = list.filter((x) => !isPromised(x))
  const promised = list.filter(isPromised)
  const sum = (l: Funding[]) => l.reduce((t, x) => t + Number(x.amount), 0)
  const byKind = KINDS.map(([k, l]) => ({ k, l, sum: sum(received.filter((x) => x.kind === k)) })).filter((x) => x.sum)

  const row = (x: Funding) => (
    <div key={x.id} className="list-row">
      <span className="grow"><span className="block"><b>{x.source}</b></span>
        <span className="small muted">{kindName(x.kind)}{x.received_on ? ` · ${isPromised(x) ? 'expected ' : ''}${fmtDate(x.received_on)}` : ''}{x.note ? ` · ${x.note}` : ''}</span>
        {isPromised(x) && <span className="block" style={{ marginTop: 8 }}><button className="btn ghost small-btn" onClick={() => markReceived(x)}>Mark received</button></span>}</span>
      <b className={isPromised(x) ? 'amber' : 'green'}>{hk(x.amount)}</b>
      <button className="icon-btn" aria-label="Delete" onClick={() => del(x)}>×</button>
    </div>
  )

  return (
    <div className="stack narrow">
      <h1 className="page-title">Income</h1>
      <p className="muted small">All money for the project: sponsors, the club's underwriting, ticket sales. Only money already <b>received</b> counts in the balance. Money that is only promised is listed separately until it arrives.</p>
      <ErrorBox msg={err} />

      <Section title={`Promised, not yet paid · ${hk(sum(promised))}`}>
        <Card className="list">
          {promised.length === 0 && <Empty>Nothing waiting.</Empty>}
          {promised.map(row)}
        </Card>
      </Section>

      <Section title={`Received · ${hk(sum(received))}`}>
        <Card className="list">
          {received.length === 0 && <Empty>Nothing received yet.</Empty>}
          {received.map(row)}
          {byKind.length > 1 && byKind.map((x) => <div key={x.k} className="list-row small muted"><span className="grow">Total {x.l.toLowerCase()}</span><span>{hk(x.sum)}</span></div>)}
        </Card>
      </Section>

      <Section title="Add income">
        <Card>
          <form className="stack" onSubmit={add}>
            <div className="seg" role="radiogroup" aria-label="Status">
              {[['received', 'Received'], ['promised', 'Promised (not paid yet)']].map(([v, l]) => (
                <button type="button" role="radio" aria-checked={f.status === v} key={v} className={f.status === v ? 'on' : ''} onClick={() => setF({ ...f, status: v })}>{l}</button>
              ))}
            </div>
            <div className="grid2 tight">
              <Field label="Type"><select value={f.kind} onChange={set('kind')}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
              <Field label="Amount (HK$)"><input inputMode="decimal" value={f.amount} onChange={set('amount')} placeholder="0.00" /></Field>
              <Field label="From (name)"><input value={f.source} onChange={set('source')} placeholder="e.g. sponsor name / RC Neoteric HK" /></Field>
              <Field label={promisedMode ? 'Expected by' : 'Date received'}><input type="date" value={f.received_on} onChange={set('received_on')} /></Field>
            </div>
            <Field label="Note (optional)"><input value={f.note} onChange={set('note')} placeholder={promisedMode ? 'e.g. pays after signing the agreement' : ''} /></Field>
            <button className="btn primary">{promisedMode ? 'Add promised income' : 'Add received income'}</button>
          </form>
        </Card>
      </Section>
    </div>
  )
}
