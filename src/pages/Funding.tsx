import React, { useEffect, useState } from 'react'
import { sb, errText } from '../lib/supabase'
import { Funding, hk, signedUrls } from '../lib/store'
import { fmtDate, parseAmount, shrinkPhoto, today } from '../lib/format'
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
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState<string | null>(null)
  useEffect(() => {
    sb.from('funding').select('*').order('received_on').then(async ({ data, error }) => {
      if (error) return setErr(errText(error))
      const l = (data as Funding[]) || []
      setList(l)
      setUrls(await signedUrls(l.flatMap((x) => x.proof_paths || [])))
    })
  }, [tick])
  // Proof for money coming in: transfer screenshot, sponsor agreement, ticket platform payout
  const addProof = async (x: Funding, e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []); e.target.value = ''
    if (!picked.length) return
    setErr(null); setUploading(x.id)
    try {
      const paths: string[] = []
      for (const original of picked) {
        const file = await shrinkPhoto(original)
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
        const path = `income/${x.id}/${crypto.randomUUID()}.${ext}`
        const { error } = await sb.storage.from('receipts').upload(path, file, { contentType: file.type || undefined })
        if (error) throw error
        paths.push(path)
      }
      const { error } = await sb.from('funding').update({ proof_paths: [...(x.proof_paths || []), ...paths] }).eq('id', x.id)
      if (error) throw error
      setTick(tick + 1)
    } catch (z) { setErr(errText(z)) }
    setUploading(null)
  }
  const removeProof = async (x: Funding, p: string) => {
    const ok = await dlg.ask({ title: 'Remove this proof?', message: x.source, input: false, confirmText: 'Remove', danger: true })
    if (!ok) return
    const { error } = await sb.from('funding').update({ proof_paths: (x.proof_paths || []).filter((q) => q !== p) }).eq('id', x.id)
    if (error) return setErr(errText(error))
    await sb.storage.from('receipts').remove([p]); setTick(tick + 1)
  }
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value })
  const promisedMode = f.status === 'promised'

  const add = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null)
    const parsed = parseAmount(f.amount)
    if (parsed.err !== undefined) return setErr(parsed.err)
    const amount = parsed.n
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
    if (error) return setErr(errText(error))
    if (x.proof_paths?.length) await sb.storage.from('receipts').remove(x.proof_paths)
    setTick(tick + 1)
  }

  const received = list.filter((x) => !isPromised(x))
  const promised = list.filter(isPromised)
  const sum = (l: Funding[]) => l.reduce((t, x) => t + Number(x.amount), 0)
  const byKind = KINDS.map(([k, l]) => ({ k, l, sum: sum(received.filter((x) => x.kind === k)) })).filter((x) => x.sum)

  const row = (x: Funding) => (
    <div key={x.id} className="list-row">
      <span className="grow"><span className="block"><b>{x.source}</b></span>
        <span className="small muted">{kindName(x.kind)}{x.received_on ? ` · ${isPromised(x) ? 'expected ' : ''}${fmtDate(x.received_on)}` : ''}{x.note ? ` · ${x.note}` : ''}</span>
        <span className="income-proofs">
          {(x.proof_paths || []).map((p, k) => (
            <span key={p} className="chip"><a href={urls[p]} target="_blank" rel="noreferrer">Proof {k + 1}{p.endsWith('.pdf') ? ' (PDF)' : ''}</a><button type="button" aria-label={`Remove proof ${k + 1}`} onClick={() => removeProof(x, p)}>×</button></span>
          ))}
          {!isPromised(x) && !(x.proof_paths || []).length && <span className="badge amber">No proof</span>}
          <label className="btn ghost small-btn">{uploading === x.id ? 'Uploading…' : '+ Add proof'}<input type="file" accept="image/*,application/pdf" multiple hidden disabled={uploading === x.id} onChange={(e) => addProof(x, e)} /></label>
          {isPromised(x) && <button className="btn ghost small-btn" onClick={() => markReceived(x)}>Mark received</button>}
        </span></span>
      <b className={isPromised(x) ? 'amber' : 'green'}>{hk(x.amount)}</b>
      <button className="icon-btn" aria-label="Delete" onClick={() => del(x)}>×</button>
    </div>
  )

  return (
    <div className="stack narrow">
      <h1 className="page-title">Income</h1>
      <p className="muted small">All money for the project: sponsors, the club's underwriting, ticket sales. Only money already <b>received</b> counts in the balance. Add proof to each line: a bank transfer screenshot, the sponsor agreement, or the ticket platform payout. Money that is only promised is listed separately until it arrives.</p>
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
              <Field label="From (name)"><input value={f.source} onChange={set('source')} placeholder="e.g. sponsor or club name" /></Field>
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
