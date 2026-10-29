import React, { useEffect, useState } from 'react'
import { sb, errText } from '../lib/supabase'
import { useApp } from '../lib/app'
import { STATUS, TYPE_LABEL, fmtDate, money } from '../lib/format'
import { Badge, Card, Empty, ErrorBox, Loading, Section } from '../components/ui'
import EntryDetail from '../components/EntryDetail'

export default function Approvals() {
  const app = useApp()
  const [queue, setQueue] = useState<any[] | null>(null)
  const [unpaid, setUnpaid] = useState<any[]>([])
  const [deposits, setDeposits] = useState<any[]>([])
  const [mine, setMine] = useState<any[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [open, setOpen] = useState<any>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!app.staff) return
    sb.rpc('my_queue').then(({ data, error }) => (error ? setErr(errText(error)) : setQueue(data || [])))
    if (app.finance) {
      sb.from('entries').select('*').eq('status', 'approved').order('txn_date').then(({ data }) => setUnpaid(data || []))
      sb.from('entries').select('*').eq('method', 'deposit').eq('status', 'paid').is('recognized_at', null).order('txn_date').then(({ data }) => setDeposits(data || []))
    }
    sb.from('entries').select('*').eq('submitted_by', app.profile!.id).in('status', ['returned', 'awaiting_division', 'awaiting_finance', 'awaiting_organizer', 'awaiting_verification'])
      .order('created_at', { ascending: false }).then(({ data }) => setMine(data || []))
  }, [app.staff, tick])

  if (!app.staff) {
    return <Card className="hero"><h1>Approvals</h1><p>Log in to see entries waiting for you.</p><a className="btn primary" href="#/login/lead">Project Lead Login</a></Card>
  }

  const Item = ({ e }: { e: any }) => (
    <button className={`entry ${e.type === 'income' ? 'in' : 'out'}`} onClick={() => setOpen(e)}>
      <div className="row between gap">
        <span className="entry-title">{e.title}</span>
        <b className={`entry-amt ${e.type === 'income' ? 'green' : 'red'}`}>{money(e.amount)}</b>
      </div>
      <div className="row gap wrap"><Badge tone="gray">{TYPE_LABEL[e.type]}{e.in_kind ? ' · in-kind' : ''}</Badge><Badge status={e.status} />{e.receipt_path && <Badge tone="gray">Receipt</Badge>}</div>
      <span className="entry-meta">{[e.ref, fmtDate(e.txn_date), app.nameOf.division(e.division_id), app.nameOf.category(e.category_id), e.submitter_name].filter((x) => x && x !== '—').join(' · ')}</span>
    </button>
  )

  return (
    <div className="stack">
      <h1 className="page-title">Approvals</h1>
      <p className="muted small">{app.profile!.full_name || app.profile!.username} · {app.roleLabel(app.profile)}. You never see your own submissions here: someone else must approve them.</p>
      <ErrorBox msg={err} />
      <Section title={`Waiting for you${queue ? ` (${queue.length})` : ''}`}>
        {!queue && <Loading />}
        {queue && queue.length === 0 && <Empty>Nothing waiting for you. Nice.</Empty>}
        <div className="stack tight">{queue?.map((e) => <Item key={e.id} e={e} />)}</div>
      </Section>
      {app.finance && (
        <Section title={`Approved, not paid yet (${unpaid.length})`}>
          {unpaid.length === 0 ? <Empty>No reimbursements or supplier invoices waiting for payment.</Empty> : <div className="stack tight">{unpaid.map((e) => <Item key={e.id} e={e} />)}</div>}
        </Section>
      )}
      {app.finance && deposits.length > 0 && (
        <Section title={`Deposits not used yet (${deposits.length})`}>
          <div className="stack tight">{deposits.map((e) => <Item key={e.id} e={e} />)}</div>
        </Section>
      )}
      <Section title="My submissions in progress">
        {mine.length === 0 ? <Empty>None.</Empty> : <div className="stack tight">{mine.map((e) => <Item key={e.id} e={e} />)}</div>}
      </Section>
      {open && <EntryDetail entry={open} onClose={() => setOpen(null)} onChanged={() => setTick(tick + 1)} />}
    </div>
  )
}
