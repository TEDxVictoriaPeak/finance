import React, { useEffect, useState } from 'react'
import { sb, errText } from '../lib/supabase'
import { useApp } from '../lib/app'
import { centsToInput, fmtDate, fmtDateTime, money, monthLabel, parseMoney, today } from '../lib/format'
import { Card, Empty, ErrorBox, Field, Section, useDialog } from '../components/ui'

function PostForm({ type, onDone }: { type: 'transfer' | 'advance' | 'advance_return'; onDone: () => void }) {
  const app = useApp()
  const cash = app.accounts.filter((a) => a.is_cash && !a.archived)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [who, setWho] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setMsg(null)
    const c = parseMoney(amount)
    if (!c || c <= 0) return setErr('Enter an amount.')
    if ((type !== 'transfer') && !who.trim()) return setErr('Enter the member’s name.')
    const title = type === 'transfer' ? `Transfer ${app.nameOf.account(from)} → ${app.nameOf.account(to)}`
      : type === 'advance' ? `Cash advance to ${who.trim()}` : `Advance returned by ${who.trim()}`
    const { data, error } = await sb.rpc('finance_post', { p: { type, amount: c, txn_date: date, account_id: from, to_account_id: to || null, payee: who.trim() || null, title, description: note } })
    if (error) return setErr(errText(error))
    setMsg(`Posted as ${data}.`); setAmount(''); setWho(''); setNote(''); onDone()
  }
  return (
    <form className="stack" onSubmit={save}>
      <div className="grid2 tight">
        <Field label={type === 'advance_return' ? 'Returned into' : 'From account'}>
          <select value={from} onChange={(e) => setFrom(e.target.value)}><option value="">Choose…</option>{cash.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        </Field>
        {type === 'transfer' ? (
          <Field label="To account">
            <select value={to} onChange={(e) => setTo(e.target.value)}><option value="">Choose…</option>{cash.filter((a) => a.id !== from).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          </Field>
        ) : (
          <Field label="Member"><input value={who} onChange={(e) => setWho(e.target.value)} /></Field>
        )}
        <Field label="Amount (HK$)"><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <Field label="Note (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <ErrorBox msg={err} />{msg && <div className="ok-box">{msg}</div>}
      <button className="btn primary">Post</button>
    </form>
  )
}

export default function Finance() {
  const app = useApp()
  const dlg = useDialog()
  const [tab, setTab] = useState('transfer')
  const [balances, setBalances] = useState<Record<string, number>>({})
  const [openings, setOpenings] = useState<any[]>([])
  const [recons, setRecons] = useState<any[]>([])
  const [locks, setLocks] = useState<string[]>([])
  const [tick, setTick] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [rAcc, setRAcc] = useState('')
  const [rDate, setRDate] = useState(today())
  const [rBal, setRBal] = useState('')
  const [rMsg, setRMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!app.staff) return
    sb.rpc('ledger_lines', { p_from: null, p_to: null }).then(({ data }) => {
      const b: Record<string, number> = {}
      ;(data as any[] || []).forEach((l) => {
        const sign = ['asset', 'expense'].includes(l.account_type) ? 1 : -1
        b[l.account_id] = (b[l.account_id] || 0) + sign * (l.debit - l.credit)
      })
      setBalances(b)
    })
    sb.from('entries').select('*').eq('type', 'opening').eq('status', 'posted').then(({ data }) => setOpenings(data || []))
    sb.from('reconciliations').select('*').order('at', { ascending: false }).limit(30).then(({ data }) => setRecons(data || []))
    sb.from('period_locks').select('month').then(({ data }) => setLocks((data || []).map((x: any) => x.month)))
  }, [app.staff, tick])

  if (!(app.finance || app.organizer)) return <Card className="hero"><h1>Finance tools</h1><p>For the finance team only.</p></Card>
  const refresh = () => setTick(tick + 1)

  const assetsLiab = app.accounts.filter((a) => (a.type === 'asset' || a.type === 'liability') && !a.archived)
  const months: string[] = []
  { const d = new Date(); d.setDate(1); for (let i = 0; i < 12; i++) { months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`); d.setMonth(d.getMonth() - 1) } }

  const setOpening = async (accId: string, current?: any) => {
    const amt = await dlg.ask({ title: `Opening balance – ${app.nameOf.account(accId)}`, message: 'Enter the balance on the day you start using this system (e.g. from the bank statement). Enter 0 to remove.', label: 'Amount (HK$)', required: true, confirmText: 'Next' })
    if (amt === null) return
    const c = parseMoney(amt)
    if (c === null) return setErr('Not a valid amount.')
    const d = await dlg.ask({ title: 'Opening balance date', message: 'Date in YYYY-MM-DD format, e.g. 2026-07-01', label: 'Date', required: true, confirmText: 'Save' })
    if (!d) return
    const { error } = await sb.rpc('set_opening_balance', { p_account: accId, p_amount: c, p_date: d.trim() })
    if (error) setErr(errText(error)); else refresh()
  }

  const reconcile = async () => {
    setRMsg(null); setErr(null)
    const c = parseMoney(rBal)
    if (!rAcc || c === null) return setErr('Choose the account and enter the statement balance.')
    const { data, error } = await sb.rpc('add_reconciliation', { p_account: rAcc, p_date: rDate, p_statement: c })
    if (error) return setErr(errText(error))
    setRMsg(data === 0 ? 'Matched. The system agrees with the bank statement.' : `Difference of ${money(data as number)}. Look for missing or wrong entries up to ${fmtDate(rDate)}.`)
    refresh()
  }

  const toggleLock = async (m: string, locked: boolean) => {
    const ok = await dlg.ask({ title: locked ? 'Reopen month' : 'Close month', message: locked ? `Allow changes to ${monthLabel(m)} again?` : `Close ${monthLabel(m)}? No entries dated in this month can be added or changed until it is reopened.`, input: false, confirmText: locked ? 'Reopen' : 'Close month' })
    if (!ok) return
    const { error } = await sb.rpc('set_month_lock', { p_month: m, p_locked: !locked })
    if (error) setErr(errText(error)); else refresh()
  }

  return (
    <div className="stack">
      <h1 className="page-title">Finance tools</h1>
      <ErrorBox msg={err} />

      <Section title="Account balances">
        <Card className="list">
          {assetsLiab.map((a) => (
            <div key={a.id} className="list-row"><span>{a.name}<span className="small muted"> · {a.type}</span></span><b>{money(balances[a.id] || 0)}</b></div>
          ))}
        </Card>
      </Section>

      {app.finance && (
        <Section title="Post an entry">
          <div className="tabs">
            {[['transfer', 'Transfer'], ['advance', 'Cash advance'], ['advance_return', 'Advance returned']].map(([k, l]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
          <Card>
            <p className="muted small">{tab === 'transfer' ? 'Moving money between your own accounts (e.g. bank → petty cash). Not income or expense.'
              : tab === 'advance' ? 'Cash given to a member before they spend it. They settle it by submitting expenses with “Paid from a cash advance”.'
              : 'Leftover cash a member gives back after an advance.'}</p>
            <PostForm key={tab} type={tab as any} onDone={refresh} />
          </Card>
        </Section>
      )}

      <Section title="Bank reconciliation">
        <Card className="stack">
          <p className="muted small">Each month, enter the closing balance from the bank statement. The app compares it with the system.</p>
          {app.finance && (
            <>
              <div className="grid2 tight">
                <Field label="Account"><select value={rAcc} onChange={(e) => setRAcc(e.target.value)}><option value="">Choose…</option>{app.accounts.filter((a) => a.is_cash).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
                <Field label="Statement date"><input type="date" value={rDate} onChange={(e) => setRDate(e.target.value)} /></Field>
                <Field label="Statement balance (HK$)"><input inputMode="decimal" value={rBal} onChange={(e) => setRBal(e.target.value)} /></Field>
              </div>
              {rMsg && <div className={rMsg.startsWith('Matched') ? 'ok-box' : 'error-box'}>{rMsg}</div>}
              <button className="btn primary" onClick={reconcile}>Check</button>
            </>
          )}
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Account</th><th>Date</th><th className="num">Statement</th><th className="num">System</th><th className="num">Difference</th><th>By</th>{app.finAdmin && <th />}</tr></thead>
              <tbody>
                {recons.map((r) => (
                  <tr key={r.id}><td>{app.nameOf.account(r.account_id)}</td><td className="nowrap">{fmtDate(r.statement_date)}</td><td className="num">{money(r.statement_balance)}</td><td className="num">{money(r.system_balance)}</td><td className={`num ${r.difference ? 'red' : 'green'}`}>{r.difference ? money(r.difference) : 'Matched'}</td><td>{r.actor_name}</td>{app.finAdmin && <td><button className="link-btn red" onClick={async () => {
                    const ok = await dlg.ask({ title: 'Delete this check?', message: 'Removes this reconciliation record only. No balance changes.', input: false, confirmText: 'Delete', danger: true })
                    if (!ok) return
                    const { error } = await sb.rpc('delete_reconciliation', { p_id: r.id })
                    if (error) setErr(errText(error)); else refresh()
                  }}>Delete</button></td>}</tr>
                ))}
              </tbody>
            </table>
            {recons.length === 0 && <Empty>No reconciliations yet.</Empty>}
          </div>
        </Card>
      </Section>

      {app.finAdmin && (
        <Section title="Opening balances">
          <Card className="list">
            <p className="muted small">Set once when you start: what each account held on day one.</p>
            {assetsLiab.map((a) => {
              const op = openings.find((o) => o.account_id === a.id)
              return (
                <div key={a.id} className="list-row">
                  <span className="grow"><span className="block">{a.name}</span><span className="small muted">{op ? `${money(op.amount)} on ${fmtDate(op.txn_date)}` : 'Not set'}</span></span>
                  <button className="btn ghost small-btn" onClick={() => setOpening(a.id, op)}>{op ? 'Change' : 'Set'}</button>
                </div>
              )
            })}
          </Card>
        </Section>
      )}

      <Section title="Month-end close">
        <Card className="list">
          <p className="muted small">After reconciling a month, close it so nobody can change it by accident.</p>
          {months.map((m) => {
            const locked = locks.includes(m)
            return (
              <div key={m} className="list-row">
                <span>{monthLabel(m)}</span>
                {app.finAdmin ? <button className={`btn small-btn ${locked ? 'ghost' : 'ghost'}`} onClick={() => toggleLock(m, locked)}>{locked ? 'Closed · reopen' : 'Close month'}</button>
                  : <span className="small muted">{locked ? 'Closed' : 'Open'}</span>}
              </div>
            )
          })}
        </Card>
      </Section>
    </div>
  )
}
