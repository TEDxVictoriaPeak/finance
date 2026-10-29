import React, { useEffect, useMemo, useState } from 'react'
import { sb, errText } from '../lib/supabase'
import { useApp } from '../lib/app'
import { centsToInput, money, parseMoney, today } from '../lib/format'
import { ErrorBox, Field, useDialog } from './ui'

type Props = { kind: 'expense' | 'income'; existing?: any; preset?: any; onDone: (ref?: string) => void }

export default function EntryForm({ kind, existing, preset, onDone }: Props) {
  const app = useApp()
  const dlg = useDialog()
  const ex = existing || preset || {}
  const [name, setName] = useState(() => { try { return localStorage.getItem('tedx-name') || '' } catch { return '' } })
  const [title, setTitle] = useState(ex.title || '')
  const [payee, setPayee] = useState(ex.payee || '')
  const [date, setDate] = useState(ex.txn_date || today())
  const [amount, setAmount] = useState(centsToInput(ex.amount))
  const [division, setDivision] = useState(ex.division_id || app.profile?.division_id || '')
  const [category, setCategory] = useState(ex.category_id || '')
  const [method, setMethod] = useState(ex.method || '')
  const [account, setAccount] = useState(ex.account_id || '')
  const [inKind, setInKind] = useState(!!ex.in_kind)
  const [sponsor, setSponsor] = useState(ex.sponsor_id || '')
  const [settles, setSettles] = useState(!!ex.settles_receivable)
  const [description, setDescription] = useState(ex.description || '')
  const [privateNote, setPrivateNote] = useState(ex.private_note || '')
  const [file, setFile] = useState<File | null>(null)
  const [trap, setTrap] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [publicSponsors, setPublicSponsors] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    if (!app.staff && kind === 'income') {
      sb.rpc('form_options').then(({ data }) => setPublicSponsors((data as any)?.sponsors || []))
    }
  }, [app.staff, kind])

  const divisions = app.divisions.filter((d) => !d.archived || d.id === division)
  const cats = app.categories.filter((c) => (c.kind === (kind === 'income' && !inKind ? 'income' : 'expense')) && (!c.archived || c.id === category))
  const cash = app.accounts.filter((a) => a.is_cash && !a.archived)
  const sponsors = app.staff ? app.sponsors.filter((s) => s.status !== 'lost').map((s) => ({ id: s.id, name: s.name })) : publicSponsors
  const cents = parseMoney(amount)
  const receiptNeeded = kind === 'expense' && (cents || 0) > (app.settings?.receipt_required_above || 0) && !ex.receipt_path
  const methods: [string, string][] = [
    ['club', 'Paid from a club account (card / bank / petty cash)'],
    ['member', 'I paid myself – please reimburse me'],
    ['invoice', 'Supplier invoice – not paid yet'],
    ['deposit', 'Deposit paid in advance (e.g. venue)'],
  ]
  if (app.staff) methods.push(['advance', 'Paid from a cash advance I received'])

  // Budget hint for the chosen line
  const [budgetInfo, setBudgetInfo] = useState<string | null>(null)
  useEffect(() => {
    setBudgetInfo(null)
    if (kind !== 'expense' || !division || !category) return
    sb.from('budgets').select('amount').eq('fy', app.currentFy).eq('division_id', division).eq('category_id', category).maybeSingle()
      .then(({ data }) => setBudgetInfo(data ? `Budget for this line: ${money(data.amount)}` : 'No budget set for this division and category yet.'))
  }, [division, category, kind])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (trap) return
    setErr(null)
    if (!cents || cents <= 0) return setErr('Please enter the amount.')
    if (!title.trim()) return setErr('Please enter a title.')
    if (!app.staff && !name.trim()) return setErr('Please enter your name.')
    if (!category) return setErr('Please choose a category.')
    if (kind === 'expense') {
      if (!division) return setErr('Please choose a division.')
      if (!method) return setErr('Please choose how it was paid.')
      if ((method === 'club' || method === 'deposit') && !account) return setErr('Please choose which account paid.')
      if (receiptNeeded && !file) return setErr(`A receipt is needed for expenses above ${money(app.settings?.receipt_required_above)}.`)
    }
    setBusy(true)
    try {
      if (!existing) {
        const { data: dup } = await sb.rpc('possible_duplicate', { p_amount: cents, p_date: date, p_payee: payee || null })
        if ((dup as number) > 0) {
          const ok = await dlg.ask({ title: 'Possible duplicate', message: `There is already an entry for ${money(cents)} on this date${payee ? ` for ${payee}` : ''}. Submit anyway?`, input: false, confirmText: 'Submit anyway' })
          if (!ok) { setBusy(false); return }
        }
      }
      let receipt_path: string | undefined
      if (file) {
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
        const path = `incoming/${crypto.randomUUID()}.${ext}`
        const { error } = await sb.storage.from('receipts').upload(path, file, { contentType: file.type || undefined })
        if (error) throw error
        receipt_path = path
      }
      const p: Record<string, any> = {
        type: kind, title: title.trim(), payee: payee.trim(), txn_date: date, amount: cents,
        division_id: division || null, category_id: category, description,
        submitter_name: name.trim(),
      }
      if (app.staff) p.private_note = privateNote
      if (kind === 'expense') { p.method = method; p.account_id = method === 'club' || method === 'deposit' ? account : null }
      else { p.in_kind = inKind; p.account_id = inKind ? null : account || null; p.sponsor_id = sponsor || null; p.settles_receivable = !!sponsor && settles }
      if (receipt_path) p.receipt_path = receipt_path

      if (existing) {
        const { error } = await sb.rpc('update_entry', { p_id: existing.id, p })
        if (error) throw error
        onDone(existing.ref)
      } else {
        const { data, error } = await sb.rpc('submit_entry', { p })
        if (error) throw error
        try { if (name.trim()) localStorage.setItem('tedx-name', name.trim()) } catch { /* ignore */ }
        onDone(data as string)
      }
    } catch (x) {
      setErr(errText(x))
    }
    setBusy(false)
  }

  if (app.divisions.length === 0 && kind === 'expense') {
    return <ErrorBox msg="No divisions have been set up yet. A Project Lead needs to add them in Settings first." />
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <input className="trap" tabIndex={-1} autoComplete="off" aria-hidden="true" value={trap} onChange={(e) => setTrap(e.target.value)} name="website" />
      {!app.staff && (
        <Field label="Your name"><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></Field>
      )}
      <Field label="Title" hint={kind === 'expense' ? 'What was it for? e.g. "Printing – sponsor deck"' : 'e.g. "Gold sponsor – 1st instalment"'}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
      </Field>
      <div className="grid2 tight">
        <Field label="Amount (HK$)"><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required /></Field>
        <Field label={kind === 'expense' ? 'Date of expense' : 'Date received'}><input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
      </div>
      <Field label={kind === 'expense' ? 'Paid to (shop / supplier / person)' : 'Received from'}>
        <input value={payee} onChange={(e) => setPayee(e.target.value)} maxLength={120} />
      </Field>

      {kind === 'income' && (
        <label className="check">
          <input type="checkbox" checked={inKind} onChange={(e) => { setInKind(e.target.checked); setCategory('') }} />
          <span>In-kind (goods or services instead of money, e.g. free venue or printing)</span>
        </label>
      )}

      <div className="grid2 tight">
        <Field label={kind === 'expense' ? 'Division' : 'Division (optional)'}>
          <select value={division} onChange={(e) => setDivision(e.target.value)}>
            <option value="">Choose…</option>
            {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label={kind === 'income' && inKind ? 'Which expense does it cover?' : 'Category'}>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Choose…</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </div>
      {budgetInfo && <p className="small muted">{budgetInfo}</p>}

      {kind === 'expense' && (
        <fieldset className="radios">
          <legend>How was it paid?</legend>
          {methods.map(([v, l]) => (
            <label key={v} className={`radio ${method === v ? 'on' : ''}`}>
              <input type="radio" name="method" value={v} checked={method === v} onChange={() => setMethod(v)} />
              <span>{l}</span>
            </label>
          ))}
        </fieldset>
      )}

      {((kind === 'expense' && (method === 'club' || method === 'deposit')) || (kind === 'income' && !inKind)) && (
        <Field label={kind === 'expense' ? 'Which account paid?' : 'Received into (if you know)'}>
          <select value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="">Choose…</option>
            {cash.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
      )}

      {kind === 'income' && sponsors.length > 0 && (
        <Field label="Sponsor (if this came from a sponsor)">
          <select value={sponsor} onChange={(e) => setSponsor(e.target.value)}>
            <option value="">Not from a sponsor</option>
            {sponsors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      )}
      {kind === 'income' && sponsor && !inKind && (
        <label className="check">
          <input type="checkbox" checked={settles} onChange={(e) => setSettles(e.target.checked)} />
          <span>This pays a sponsor invoice we already recorded</span>
        </label>
      )}

      <Field label="Description (optional)"><textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} /></Field>
      {app.staff && (
        <Field label="Private note (team only, hidden from the public view)"><textarea rows={2} value={privateNote} onChange={(e) => setPrivateNote(e.target.value)} /></Field>
      )}

      <Field label={kind === 'expense' ? `Receipt${receiptNeeded ? ' (required)' : ' (optional)'}` : 'Proof (optional)'} hint={ex.receipt_path ? 'A receipt is already attached. Choose a file only to replace it.' : 'Photo or PDF, up to 10 MB'}>
        <input type="file" accept="image/*,application/pdf" capture="environment" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </Field>

      <ErrorBox msg={err} />
      <button className="btn primary big" disabled={busy}>{busy ? 'Saving…' : existing ? 'Save and resubmit' : kind === 'expense' ? 'Submit for approval' : 'Submit income'}</button>
    </form>
  )
}
