import React, { useEffect, useState } from 'react'
import { sb, errText } from '../lib/supabase'
import { useApp } from '../lib/app'
import { METHOD_LABEL, PENDING, TYPE_LABEL, fmtDate, fmtDateTime, money, today } from '../lib/format'
import { Badge, ErrorBox, Field, Modal, useDialog } from './ui'
import EntryForm from './EntryForm'

export default function EntryDetail({ entry, onClose, onChanged }: { entry: any; onClose: () => void; onChanged: () => void }) {
  const app = useApp()
  const dlg = useDialog()
  const [trail, setTrail] = useState<any[]>([])
  const [canAct, setCanAct] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [edit, setEdit] = useState(false)
  const [payAcc, setPayAcc] = useState(entry.account_id || '')
  const [payDate, setPayDate] = useState(today())
  const cash = app.accounts.filter((a) => a.is_cash && !a.archived)

  useEffect(() => {
    sb.from('approvals').select('*').eq('entry_id', entry.id).order('id').then(({ data }) => setTrail(data || []))
    sb.rpc('my_queue').then(({ data }) => setCanAct(!!(data as any[])?.find((x) => x.id === entry.id)))
  }, [entry.id])

  const run = async (action: string, extra: Record<string, any> = {}) => {
    setBusy(true); setErr(null)
    const { error } = await sb.rpc('act_on_entry', { p_id: entry.id, p_action: action, ...extra })
    setBusy(false)
    if (error) {
      if (String(error.message).startsWith('OVER_BUDGET')) {
        if (!(app.finAdmin || app.organizer)) {
          setErr(errText(error) + ' Only the Head of Finance or the Organizer can approve over budget.')
          return
        }
        const reason = await dlg.ask({ title: 'Over budget', message: errText(error), label: 'Reason for approving over budget', required: true, confirmText: 'Approve anyway' })
        if (reason) return run(action, { ...extra, p_override: reason })
        return
      }
      setErr(errText(error)); return
    }
    onChanged(); onClose()
  }

  const withReason = async (action: string, title: string, danger = false) => {
    const note = await dlg.ask({ title, label: 'Reason (the submitter will see this)', required: true, danger, confirmText: title })
    if (note) run(action, { p_note: note })
  }

  const openReceipt = async () => {
    const { data, error } = await sb.storage.from('receipts').createSignedUrl(entry.receipt_path, 300)
    if (error) setErr(errText(error)); else window.open(data.signedUrl, '_blank')
  }

  const canEdit = ['returned', ...PENDING].includes(entry.status) && entry.type !== 'opening' &&
    (app.finance || app.organizer || app.profile?.division_id === entry.division_id || entry.submitted_by === app.profile?.id)
  const canDelete = ['returned', 'rejected', ...PENDING].includes(entry.status) && entry.type !== 'opening' &&
    (app.finance || app.organizer || app.profile?.division_id === entry.division_id || entry.submitted_by === app.profile?.id)

  const removeFile = async (path: string | null) => {
    if (path) await sb.storage.from('receipts').remove([path])
  }
  const deleteEntry = async () => {
    const ok = await dlg.ask({ title: `Delete ${entry.ref}?`, message: 'This entry was never posted, so deleting it does not change any balance. It is removed for good (a record stays in the Activity log).', input: false, confirmText: 'Delete', danger: true })
    if (!ok) return
    setBusy(true); setErr(null)
    const { data, error } = await sb.rpc('delete_entry', { p_id: entry.id })
    setBusy(false)
    if (error) return setErr(errText(error))
    await removeFile(data as string | null)
    onChanged(); onClose()
  }
  const removeReceipt = async () => {
    const ok = await dlg.ask({ title: 'Remove receipt?', message: 'The receipt file is deleted. You can attach a new one with Edit.', input: false, confirmText: 'Remove', danger: true })
    if (!ok) return
    const { data, error } = await sb.rpc('remove_receipt', { p_id: entry.id })
    if (error) return setErr(errText(error))
    await removeFile(data as string | null)
    onChanged(); onClose()
  }
  const isIncome = entry.type === 'income'
  const sign = isIncome && !entry.in_kind ? 1 : entry.type === 'expense' ? -1 : 0

  if (edit) {
    return (
      <Modal title={`Edit ${entry.ref}`} onClose={() => setEdit(false)} wide>
        <p className="muted small">Saving restarts the approval steps.</p>
        <EntryForm kind={entry.type} existing={entry} onDone={() => { onChanged(); onClose() }} />
      </Modal>
    )
  }

  return (
    <Modal title={entry.ref} onClose={onClose} wide>
      <div className="stack">
        <div className="row between gap">
          <div>
            <h3 className="detail-title">{entry.title}</h3>
            <div className="row gap wrap"><Badge tone="gray">{TYPE_LABEL[entry.type]}{entry.in_kind ? ' · in-kind' : ''}</Badge><Badge status={entry.status} /></div>
          </div>
          <b className={`detail-amount ${sign > 0 ? 'green' : sign < 0 ? 'red' : ''}`}>{sign ? money(sign * entry.amount, { sign: true }) : money(entry.amount)}</b>
        </div>

        <dl className="dl">
          <dt>Date</dt><dd>{fmtDate(entry.txn_date)}{entry.payment_date && entry.payment_date !== entry.txn_date ? ` · paid ${fmtDate(entry.payment_date)}` : ''}</dd>
          {entry.payee && <><dt>{isIncome ? 'From' : 'Payee'}</dt><dd>{entry.payee}</dd></>}
          {entry.division_id && <><dt>Division</dt><dd>{app.nameOf.division(entry.division_id)}</dd></>}
          {entry.category_id && <><dt>Category</dt><dd>{app.nameOf.category(entry.category_id)}</dd></>}
          {entry.method && <><dt>How paid</dt><dd>{METHOD_LABEL[entry.method]}</dd></>}
          {entry.account_id && <><dt>Account</dt><dd>{app.nameOf.account(entry.account_id)}{entry.to_account_id ? ` → ${app.nameOf.account(entry.to_account_id)}` : ''}</dd></>}
          {entry.sponsor_id && <><dt>Sponsor</dt><dd>{app.nameOf.sponsor(entry.sponsor_id)}{entry.settles_receivable ? ' · pays an invoice' : ''}</dd></>}
          <dt>Submitted by</dt><dd>{entry.submitter_name || '—'} · {fmtDateTime(entry.created_at)}</dd>
          <dt>Last change</dt><dd>{fmtDateTime(entry.updated_at)}</dd>
          {entry.description && <><dt>Description</dt><dd className="pre">{entry.description}</dd></>}
          {entry.private_note && <><dt>Private note</dt><dd className="pre">{entry.private_note}</dd></>}
          {entry.over_budget_override && <><dt>Over budget</dt><dd>{entry.over_budget_override}</dd></>}
          {entry.recognized_at && <><dt>Deposit used</dt><dd>{fmtDate(entry.recognized_at)}</dd></>}
          {entry.void_reason && <><dt>Void reason</dt><dd>{entry.void_reason}</dd></>}
        </dl>

        {entry.receipt_path && (
          <div className="row gap wrap">
            <button className="btn ghost" onClick={openReceipt}>View receipt</button>
            {canEdit && <button className="btn danger-ghost small-btn" onClick={removeReceipt}>Remove receipt</button>}
          </div>
        )}

        <div>
          <h4 className="small-head">Approval trail</h4>
          <ol className="trail">
            {trail.map((t) => (
              <li key={t.id}>
                <b>{t.action[0].toUpperCase() + t.action.slice(1).replace(/_/g, ' ')}</b> by {t.actor_name || '—'}
                <span className="small muted"> · {fmtDateTime(t.at)}</span>
                {t.note && <div className="small">“{t.note}”</div>}
              </li>
            ))}
          </ol>
        </div>

        <ErrorBox msg={err} />

        {canAct && entry.status !== 'awaiting_verification' && (
          <div className="action-grid">
            <button className="btn danger-ghost" disabled={busy} onClick={() => withReason('reject', 'Reject', true)}>Reject</button>
            <button className="btn ghost" disabled={busy} onClick={() => withReason('return', 'Return for changes')}>Return</button>
            <button className="btn success" disabled={busy} onClick={() => run('approve')}>Approve</button>
          </div>
        )}

        {canAct && entry.status === 'awaiting_verification' && (
          <div className="stack">
            {!entry.in_kind && (
              <Field label="Money received into">
                <select value={payAcc} onChange={(e) => setPayAcc(e.target.value)}>
                  <option value="">Choose account…</option>
                  {cash.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
            )}
            <div className="action-grid two">
              <button className="btn danger-ghost" disabled={busy} onClick={() => withReason('reject', 'Reject', true)}>Reject</button>
              <button className="btn success" disabled={busy || (!entry.in_kind && !payAcc)} onClick={() => run('verify', { p_account: payAcc || null })}>Verify & post</button>
            </div>
          </div>
        )}

        {app.finance && entry.status === 'approved' && (
          <div className="stack pay-box">
            <h4 className="small-head">Record payment</h4>
            <div className="grid2 tight">
              <Field label="Paid from">
                <select value={payAcc} onChange={(e) => setPayAcc(e.target.value)}>
                  <option value="">Choose account…</option>
                  {cash.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
              <Field label="Payment date"><input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></Field>
            </div>
            <button className="btn primary" disabled={busy || !payAcc} onClick={() => run('mark_paid', { p_account: payAcc, p_date: payDate })}>Mark as paid</button>
          </div>
        )}

        {app.finance && entry.method === 'deposit' && entry.status === 'paid' && !entry.recognized_at && (
          <button className="btn ghost" disabled={busy} onClick={async () => {
            const ok = await dlg.ask({ title: 'Deposit used', message: 'The service has been delivered, so move this deposit into expenses (dated today)?', input: false, confirmText: 'Move to expenses' })
            if (ok) run('recognize_deposit', { p_date: today() })
          }}>Service delivered – move deposit to expenses</button>
        )}

        <div className="row gap wrap end">
          {canEdit && <button className="btn ghost" onClick={() => setEdit(true)}>Edit</button>}
          {canDelete && <button className="btn danger-ghost" disabled={busy} onClick={deleteEntry}>Delete</button>}
          {app.finAdmin && ['approved', 'paid', 'posted'].includes(entry.status) && entry.type !== 'opening' && (
            <button className="btn danger-ghost" disabled={busy} onClick={() => withReason('void', 'Void entry', true)}>Void</button>
          )}
        </div>
      </div>
    </Modal>
  )
}
