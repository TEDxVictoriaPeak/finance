import React, { useEffect, useMemo, useState } from 'react'
import { sb, errText } from '../lib/supabase'
import { useApp, Sponsor } from '../lib/app'
import { centsToInput, csvMoney, downloadCSV, money, parseMoney, today } from '../lib/format'
import { Badge, Bar, Card, Empty, ErrorBox, Field, Modal, Section } from '../components/ui'
import EntryForm from '../components/EntryForm'

const STATUSES = [['prospect', 'Prospect'], ['agreed', 'Agreed'], ['invoiced', 'Invoiced'], ['paid', 'Paid'], ['lost', 'Lost']]
const TONE: Record<string, string> = { prospect: 'gray', agreed: 'blue', invoiced: 'amber', paid: 'green', lost: 'red' }

export default function Sponsors() {
  const app = useApp()
  const [entries, setEntries] = useState<any[]>([])
  const [edit, setEdit] = useState<Partial<Sponsor> | null>(null)
  const [invoice, setInvoice] = useState<Sponsor | null>(null)
  const [pay, setPay] = useState<{ s: Sponsor; inKind: boolean } | null>(null)
  const [tick, setTick] = useState(0)
  const canEdit = app.finance || app.organizer

  useEffect(() => {
    if (!app.staff) return
    sb.from('entries').select('sponsor_id,type,status,amount,in_kind,settles_receivable').not('sponsor_id', 'is', null)
      .then(({ data }) => setEntries(data || []))
  }, [app.staff, tick])

  const stats = useMemo(() => {
    const m: Record<string, { invoiced: number; cash: number; inkind: number; settled: number; pending: number }> = {}
    app.sponsors.forEach((s) => (m[s.id] = { invoiced: 0, cash: 0, inkind: 0, settled: 0, pending: 0 }))
    entries.forEach((e) => {
      const x = m[e.sponsor_id]; if (!x) return
      if (e.type === 'sponsor_invoice' && e.status === 'posted') x.invoiced += e.amount
      if (e.type === 'income' && e.status === 'posted') { if (e.in_kind) x.inkind += e.amount; else x.cash += e.amount; if (e.settles_receivable) x.settled += e.amount }
      if (e.type === 'income' && e.status === 'awaiting_verification') x.pending += e.amount
    })
    return m
  }, [entries, app.sponsors])

  if (!app.staff) return <Card className="hero"><h1>Sponsors</h1><p>Log in to see the sponsorship tracker.</p></Card>

  const totals = app.sponsors.filter((s) => s.status !== 'lost').reduce((t, s) => ({
    committed: t.committed + s.committed, received: t.received + (stats[s.id]?.cash || 0) + (stats[s.id]?.inkind || 0),
    outstanding: t.outstanding + Math.max(0, (stats[s.id]?.invoiced || 0) - (stats[s.id]?.settled || 0)),
  }), { committed: 0, received: 0, outstanding: 0 })

  const exportCsv = () => downloadCSV('sponsors', [
    ['Sponsor', 'Tier', 'Status', 'PIC', 'Committed', 'Invoiced', 'Cash received', 'In-kind received', 'Invoice outstanding', 'Benefits owed', 'Benefits delivered'],
    ...app.sponsors.map((s) => { const x = stats[s.id]; return [s.name, s.tier, s.status, s.pic, csvMoney(s.committed), csvMoney(x?.invoiced), csvMoney(x?.cash), csvMoney(x?.inkind), csvMoney(Math.max(0, (x?.invoiced || 0) - (x?.settled || 0))), s.benefits_owed, s.benefits_delivered] }),
  ])

  return (
    <div className="stack">
      <div className="row between wrap gap">
        <h1 className="page-title">Sponsors</h1>
        <div className="row gap">
          <button className="btn ghost small-btn" onClick={exportCsv}>Export</button>
          {canEdit && <button className="btn primary small-btn" onClick={() => setEdit({ tier: 'Gold', status: 'prospect', committed: 0, in_kind: false })}>Add sponsor</button>}
        </div>
      </div>
      <div className="kpis three">
        <Card className="kpi"><span className="kpi-label">Agreed</span><span className="kpi-value">{money(totals.committed)}</span></Card>
        <Card className="kpi"><span className="kpi-label">Received</span><span className="kpi-value green">{money(totals.received)}</span></Card>
        <Card className="kpi"><span className="kpi-label">Invoiced, not paid</span><span className="kpi-value amber">{money(totals.outstanding)}</span></Card>
      </div>
      {app.settings?.sponsorship_target ? <Bar value={totals.received} max={app.settings.sponsorship_target} tone="green" /> : null}

      {app.sponsors.length === 0 && <Empty>No sponsors yet.</Empty>}
      <div className="stack tight">
        {app.sponsors.map((s) => {
          const x = stats[s.id] || { invoiced: 0, cash: 0, inkind: 0, settled: 0, pending: 0 }
          const outstanding = Math.max(0, x.invoiced - x.settled)
          return (
            <Card key={s.id} className="sponsor">
              <div className="row between gap">
                <div>
                  <h3 className="detail-title">{s.name}</h3>
                  <div className="row gap wrap"><Badge tone="gray">{s.tier}{s.in_kind ? ' · in-kind' : ''}</Badge><Badge tone={TONE[s.status]}>{STATUSES.find((t) => t[0] === s.status)?.[1]}</Badge></div>
                </div>
                <b>{money(s.committed)}</b>
              </div>
              <dl className="dl compact">
                <dt>Invoiced</dt><dd>{money(x.invoiced)}</dd>
                <dt>Cash received</dt><dd className="green">{money(x.cash)}</dd>
                {x.inkind > 0 && <><dt>In-kind received</dt><dd>{money(x.inkind)}</dd></>}
                {outstanding > 0 && <><dt>Invoice outstanding</dt><dd className="amber">{money(outstanding)}</dd></>}
                {x.pending > 0 && <><dt>Waiting verification</dt><dd>{money(x.pending)}</dd></>}
                {s.pic && <><dt>PIC</dt><dd>{s.pic}</dd></>}
                {s.benefits_owed && <><dt>Benefits owed</dt><dd className="pre">{s.benefits_owed}</dd></>}
                {s.benefits_delivered && <><dt>Benefits delivered</dt><dd className="pre">{s.benefits_delivered}</dd></>}
                {s.notes && <><dt>Notes</dt><dd className="pre">{s.notes}</dd></>}
              </dl>
              <div className="row gap wrap">
                {canEdit && <button className="btn ghost small-btn" onClick={() => setEdit(s)}>Edit</button>}
                {app.finance && <button className="btn ghost small-btn" onClick={() => setInvoice(s)}>Record invoice</button>}
                <button className="btn ghost small-btn" onClick={() => setPay({ s, inKind: false })}>Record payment</button>
                <button className="btn ghost small-btn" onClick={() => setPay({ s, inKind: true })}>Record in-kind</button>
              </div>
            </Card>
          )
        })}
      </div>

      {edit && <SponsorEdit s={edit} onClose={() => setEdit(null)} onSaved={async () => { setEdit(null); await app.reload(); setTick(tick + 1) }} />}
      {invoice && <InvoiceForm s={invoice} onClose={() => setInvoice(null)} onSaved={async () => { setInvoice(null); await app.reload(); setTick(tick + 1) }} />}
      {pay && (
        <Modal title={`${pay.inKind ? 'In-kind from' : 'Payment from'} ${pay.s.name}`} onClose={() => setPay(null)} wide>
          <p className="muted small">This goes to another finance team member to verify before it counts in the balance.</p>
          <EntryForm kind="income" preset={{
            title: `${pay.s.name} – ${pay.inKind ? 'in-kind' : 'payment'}`, payee: pay.s.name, sponsor_id: pay.s.id, in_kind: pay.inKind,
            settles_receivable: !pay.inKind && (stats[pay.s.id]?.invoiced || 0) > (stats[pay.s.id]?.settled || 0),
            category_id: pay.inKind ? '' : app.categories.find((c) => c.name === 'Sponsorship – Cash')?.id || '',
          }} onDone={() => { setPay(null); setTick(tick + 1) }} />
        </Modal>
      )}
    </div>
  )
}

function SponsorEdit({ s, onClose, onSaved }: { s: Partial<Sponsor>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<any>({ ...s, committed: centsToInput(s.committed) || '0.00' })
  const [err, setErr] = useState<string | null>(null)
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const save = async () => {
    if (!f.name?.trim()) return setErr('Name is required.')
    const row = { name: f.name.trim(), tier: f.tier, in_kind: !!f.in_kind, committed: parseMoney(f.committed) || 0, status: f.status, pic: f.pic || null, benefits_owed: f.benefits_owed || null, benefits_delivered: f.benefits_delivered || null, notes: f.notes || null }
    const { error } = s.id ? await sb.from('sponsors').update(row).eq('id', s.id) : await sb.from('sponsors').insert(row)
    if (error) setErr(errText(error)); else onSaved()
  }
  return (
    <Modal title={s.id ? 'Edit sponsor' : 'Add sponsor'} onClose={onClose} wide>
      <div className="stack">
        <Field label="Sponsor name"><input value={f.name || ''} onChange={set('name')} /></Field>
        <div className="grid2 tight">
          <Field label="Tier"><input value={f.tier || ''} onChange={set('tier')} list="tiers" /></Field>
          <Field label="Status"><select value={f.status} onChange={set('status')}>{STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Agreed value (HK$)"><input inputMode="decimal" value={f.committed} onChange={set('committed')} /></Field>
          <Field label="Person in charge"><input value={f.pic || ''} onChange={set('pic')} /></Field>
        </div>
        <datalist id="tiers"><option value="Platinum" /><option value="Gold" /><option value="Silver" /><option value="Bronze" /><option value="Partner" /></datalist>
        <label className="check"><input type="checkbox" checked={!!f.in_kind} onChange={set('in_kind')} /><span>Mostly in-kind (goods or services)</span></label>
        <Field label="Benefits we owe them"><textarea rows={2} value={f.benefits_owed || ''} onChange={set('benefits_owed')} /></Field>
        <Field label="Benefits delivered so far"><textarea rows={2} value={f.benefits_delivered || ''} onChange={set('benefits_delivered')} /></Field>
        <Field label="Notes"><textarea rows={2} value={f.notes || ''} onChange={set('notes')} /></Field>
        <ErrorBox msg={err} />
        <div className="row gap end"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></div>
      </div>
    </Modal>
  )
}

function InvoiceForm({ s, onClose, onSaved }: { s: Sponsor; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(centsToInput(s.committed))
  const [date, setDate] = useState(today())
  const [title, setTitle] = useState(`${s.name} – ${s.tier} sponsorship invoice`)
  const [err, setErr] = useState<string | null>(null)
  const save = async () => {
    const c = parseMoney(amount)
    if (!c || c <= 0) return setErr('Enter the invoice amount.')
    const { error } = await sb.rpc('finance_post', { p: { type: 'sponsor_invoice', amount: c, txn_date: date, sponsor_id: s.id, title } })
    if (error) setErr(errText(error)); else onSaved()
  }
  return (
    <Modal title="Record sponsor invoice" onClose={onClose}>
      <p className="muted small">Records the money the sponsor owes us. When they pay, use “Record payment” and tick “pays a sponsor invoice”.</p>
      <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <div className="grid2 tight">
        <Field label="Amount (HK$)"><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Invoice date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <ErrorBox msg={err} />
      <div className="row gap end"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Record invoice</button></div>
    </Modal>
  )
}
