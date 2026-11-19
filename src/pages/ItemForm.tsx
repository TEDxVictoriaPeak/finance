import React, { useEffect, useRef, useState } from 'react'
import { sb, errText } from '../lib/supabase'
import { hk, isLink, Item, signedUrls, useStore } from '../lib/store'
import { fmtDate, today, parseAmount, shrinkPhoto } from '../lib/format'
import { canRead, CURRENCIES, readerOff, readReceipt, Scan } from '../lib/receipt'
import { Card, ErrorBox, Field, Loading, useDialog } from '../components/ui'

type ScanState = { state: 'idle' | 'reading' | 'done' | 'error'; msg?: string; warn?: string[] }

export default function ItemForm({ id }: { id?: string }) {
  const s = useStore()
  const dlg = useDialog()
  const [item, setItem] = useState<Item | null>(null)
  const [loaded, setLoaded] = useState(!id)
  const [f, setF] = useState({
    category_id: '', description: '', amount: '', purpose: '', purchased_item: '', supplier: '',
    submitted_by: s.profile?.full_name || '', submitted_on: today(), remarks: '',
  })
  // Who paid: the club account, or a member with their own money (to reimburse)
  const [pay, setPay] = useState({ member: false, name: '', reimbursed: false, on: today() })
  // Paid in another currency (amount stays the HK$ actually charged)
  const [cur, setCur] = useState({ on: false, code: 'USD', amount: '' })
  // No receipt at all: reason + who approved
  const [nr, setNr] = useState({ on: false, reason: '', by: s.profile?.full_name || '' })
  const [dates, setDates] = useState<string[]>([])
  const [newDate, setNewDate] = useState(today())
  const [keep, setKeep] = useState<string[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // Fields filled in by the receipt reader, shown in yellow until a person touches them
  const [auto, setAuto] = useState<Set<string>>(new Set())
  const [catTouched, setCatTouched] = useState(!!id)
  const [scan, setScan] = useState<ScanState>({ state: 'idle' })
  const unmark = (k: string) => auto.has(k) && setAuto((a) => { const n = new Set(a); n.delete(k); return n })
  const set = (k: string) => (e: any) => { setF({ ...f, [k]: e.target.value }); unmark(k); if (k === 'category_id') setCatTouched(true) }
  const hl = (k: string) => (auto.has(k) ? 'autofill' : '')
  // Latest values, so suggestions that arrive later never overwrite what a person typed meanwhile
  const live = useRef({ f, auto, cur, dates, catTouched })
  live.current = { f, auto, cur, dates, catTouched }

  useEffect(() => {
    if (!id) { setF((x) => ({ ...x, category_id: s.categories[0]?.id || '' })); return }
    sb.from('exp_items').select('*').eq('id', id).maybeSingle().then(async ({ data, error }) => {
      if (error || !data) { setErr(error ? errText(error) : 'Item not found'); setLoaded(true); return }
      const it = data as Item
      setItem(it)
      setF({
        category_id: it.category_id, description: it.description, amount: String(it.amount), purpose: it.purpose || '',
        purchased_item: it.purchased_item || '', supplier: it.supplier || '', submitted_by: it.submitted_by || '',
        submitted_on: it.submitted_on || '', remarks: it.remarks || '',
      })
      setPay({ member: !!it.paid_by_member, name: it.paid_by_member || '', reimbursed: !!it.reimbursed_on, on: it.reimbursed_on || today() })
      setCur({ on: !!it.orig_currency, code: it.orig_currency || 'USD', amount: it.orig_amount != null ? String(it.orig_amount) : '' })
      setNr({ on: !!it.no_receipt_reason, reason: it.no_receipt_reason || '', by: it.no_receipt_approved_by || s.profile?.full_name || '' })
      setDates(it.purchase_dates || [])
      setKeep(it.proof_paths || [])
      setUrls(await signedUrls(it.proof_paths || []))
      setLoaded(true)
    })
  }, [id])

  const previews = files.map((file) => ({ file, url: URL.createObjectURL(file) }))
  const [menu, setMenu] = useState(false)
  // Phones and tablets (touch screen) can use the camera; computers get a simple file chooser
  const phone = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

  /** Put the reader's suggestions into the form: only into empty fields, never over what a person typed */
  const apply = (r: Scan) => {
    if (!r.is_receipt) { setScan({ state: 'error', msg: "This doesn't look like a receipt. Please fill in by hand." }); return }
    const { f, auto, cur, dates, catTouched } = live.current
    const filled = new Set<string>()
    const next = { ...f }
    const put = (k: keyof typeof f, v: string | null | undefined) => { if (v && v.trim() && (!next[k] || auto.has(k))) { next[k] = v.trim(); filled.add(k) } }
    put('description', r.description)
    put('purchased_item', r.purchased_item)
    put('supplier', r.supplier)
    const c = s.categories.find((x) => x.letter === (r.category_letter || '').toUpperCase())
    if (c && !catTouched) { next.category_id = c.id; filled.add('category_id') }
    const code = (r.currency || '').toUpperCase()
    const warn: string[] = []
    if (r.total_paid != null && r.total_paid > 0) {
      if (!code || code === 'HKD') {
        if (!next.amount || auto.has('amount')) { next.amount = r.total_paid.toFixed(2); filled.add('amount') }
      } else {
        if (!cur.on || auto.has('cur')) { setCur({ on: true, code, amount: r.total_paid.toFixed(2) }); filled.add('cur') }
        if (!next.amount || auto.has('amount')) { next.amount = ''; filled.add('amount') }
        warn.push(`Paid in ${code} ${r.total_paid.toFixed(2)}. Enter the HK$ amount actually charged (see the card or bank statement).`)
      }
    } else warn.push('The total could not be read. Please type the amount.')
    if (/^\d{4}-\d{2}-\d{2}$/.test(r.purchase_date || '')) {
      setNewDate(r.purchase_date)
      if (!dates.includes(r.purchase_date)) setDates([...dates, r.purchase_date].sort())
      filled.add('dates')
    }
    if (r.payment_method && !next.remarks) { next.remarks = `Paid by ${r.payment_method}`; filled.add('remarks') }
    if (!r.is_proof_of_payment) warn.push('This looks like a quotation or an unpaid invoice. It is not proof of payment.')
    if (r.confidence === 'low') warn.push('The reader was not sure. Check every yellow field carefully.')
    if (r.notes) warn.push(r.notes)
    setF(next)
    setAuto(filled)
    setScan({ state: 'done', warn })
  }

  const read = async (file: File) => {
    if (!canRead(file) || readerOff()) return
    setScan({ state: 'reading' })
    const cats = s.categories.map((c) => `${c.letter}: ${c.name}`).join('\n')
    const r = await readReceipt(file, cats)
    if (r.result) apply(r.result)
    else if (r.off) setScan({ state: 'idle' })
    else setScan({ state: 'error', msg: r.error })
  }

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const added = Array.from(e.target.files || [])
    setFiles([...files, ...added]); e.target.value = ''; setMenu(false)
    // On a new item, read the first receipt automatically. When editing, use the "Fill in from receipt" button.
    if (added[0] && !id && scan.state === 'idle') read(added[0])
  }
  const addLink = async () => {
    const v = await dlg.ask({ title: 'Add Google Drive link', message: 'In Google Drive: Share › General access › Anyone with the link › Copy link. Then paste it here.', label: 'Link', required: true, confirmText: 'Add' })
    if (!v) return
    const url = v.trim()
    if (!isLink(url)) return setErr('Paste the full link, starting with https://')
    if (!keep.includes(url)) setKeep([...keep, url])
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null)
    const parsed = parseAmount(f.amount)
    if (!f.category_id) return setErr('Choose a category.')
    if (!f.description.trim()) return setErr('Write a short description, e.g. "Magnetic tags (45 items total)".')
    if (parsed.err !== undefined) return setErr(cur.on && !f.amount.trim() ? `Enter the HK$ amount actually charged for the ${cur.code} payment (see the card or bank statement).` : parsed.err)
    const amount = parsed.n
    let origAmount: number | null = null
    if (cur.on) {
      const o = parseAmount(cur.amount)
      if (o.err !== undefined) return setErr(`Original amount (${cur.code}): ${o.err}`)
      origAmount = o.n
    }
    if (pay.member && !(pay.name.trim() || f.submitted_by.trim())) return setErr('Write the name of the member who paid.')
    if (nr.on && !nr.reason.trim()) return setErr('Write why there is no receipt.')
    const allDates = newDate && !dates.includes(newDate) && dates.length === 0 ? [newDate] : dates
    setBusy(true)
    try {
      const itemId = id || crypto.randomUUID()
      const uploaded: string[] = []
      for (const original of files) {
        const file = await shrinkPhoto(original)
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
        const path = `items/${itemId}/${crypto.randomUUID()}.${ext}`
        const { error } = await sb.storage.from('receipts').upload(path, file, { contentType: file.type || undefined })
        if (error) throw error
        uploaded.push(path)
      }
      const row = {
        category_id: f.category_id, description: f.description.trim(), amount,
        purpose: f.purpose.trim() || null, purchased_item: f.purchased_item.trim() || null, supplier: f.supplier.trim() || null,
        submitted_by: f.submitted_by.trim() || null, submitted_on: f.submitted_on || null, remarks: f.remarks.trim() || null,
        paid_by_member: pay.member ? (pay.name.trim() || f.submitted_by.trim()) : null,
        reimbursed_on: pay.member && pay.reimbursed ? pay.on || today() : null,
        orig_currency: cur.on ? cur.code : null, orig_amount: cur.on ? origAmount : null,
        no_receipt_reason: nr.on ? nr.reason.trim() : null, no_receipt_approved_by: nr.on ? nr.by.trim() || null : null,
        purchase_dates: [...allDates].sort(), proof_paths: [...keep, ...uploaded],
      }
      const { error } = id ? await sb.from('exp_items').update(row).eq('id', id) : await sb.from('exp_items').insert({ id: itemId, ...row })
      if (error) throw error
      const removed = (item?.proof_paths || []).filter((p) => !keep.includes(p) && !isLink(p))
      if (removed.length) await sb.storage.from('receipts').remove(removed)
      location.hash = `#/item/${itemId}`
    } catch (x) { setErr(errText(x)) }
    setBusy(false)
  }

  const remove = async () => {
    const ok = await dlg.ask({ title: `Delete item ${item ? s.code(item) : ''}?`, message: 'The item and its screenshots are deleted. Other item numbers stay the same, and this number is never given to another item. This is recorded in the activity log.', input: false, confirmText: 'Delete', danger: true })
    if (!ok || !id) return
    const { error } = await sb.from('exp_items').delete().eq('id', id)
    if (error) return setErr(errText(error))
    const stored = (item?.proof_paths || []).filter((p) => !isLink(p))
    if (stored.length) await sb.storage.from('receipts').remove(stored)
    location.hash = '#/expenses'
  }

  if (!loaded) return <Loading />
  const cat = s.catOf(f.category_id)
  const hasProof = keep.length + files.length > 0

  const proofField = (
    <div className="field">
      <span className="field-label">{id ? 'Payment proof' : '1. Payment proof'}</span>
      <span className="field-hint">{id ? 'Photo, screenshot, PDF or Drive link showing the money was paid.' : 'Add the receipt first. The form fills itself in from it, then you check and save.'} An invoice or quotation alone is not proof.</span>
      <div className="thumbs">
        {keep.map((p) => (
          <div key={p} className="thumb">
            {isLink(p) ? <a href={p} target="_blank" rel="noreferrer" className="pdf">Drive link</a> : urls[p] ? (p.endsWith('.pdf') ? <a href={urls[p]} target="_blank" rel="noreferrer" className="pdf">PDF</a> : <img src={urls[p]} alt="Payment proof" />) : <span className="pdf">…</span>}
            <button type="button" aria-label="Remove screenshot" onClick={() => setKeep(keep.filter((x) => x !== p))}>×</button>
          </div>
        ))}
        {previews.map(({ file, url }, k) => (
          <div key={url} className="thumb new">
            {file.type === 'application/pdf' ? <span className="pdf">PDF</span> : <img src={url} alt={file.name} />}
            <button type="button" aria-label="Remove file" onClick={() => setFiles(files.filter((_, j) => j !== k))}>×</button>
          </div>
        ))}
      </div>
      {(previews.some(({ file }) => file.type === 'application/pdf') || keep.some((p) => p.endsWith('.pdf'))) && <p className="info small">PDF receipts open online but do not show on the printed item sheet. If you can, also add a screenshot of the PDF.</p>}
      <div className="proof-menu-wrap">
        <button type="button" className="btn ghost proof-add" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>+ Add payment proof</button>
        {menu && <>
          <div className="menu-backdrop" onClick={() => setMenu(false)} />
          <div className="proof-menu" role="menu">
            {phone ? <>
              <label role="menuitem"><input type="file" accept="image/*" capture="environment" onChange={pick} hidden /><b>Take photo</b><span>Opens the camera, for a paper receipt</span></label>
              <label role="menuitem"><input type="file" accept="image/*" multiple onChange={pick} hidden /><b>Photo library</b><span>Screenshots of transfers or online orders</span></label>
              <label role="menuitem"><input type="file" accept="image/*,application/pdf" multiple onChange={pick} hidden /><b>Files</b><span>PDF receipts. Google Drive shows here if its app is installed</span></label>
            </> : (
              <label role="menuitem"><input type="file" accept="image/*,application/pdf" multiple onChange={pick} hidden /><b>Choose from this computer</b><span>Photos, screenshots or PDF receipts saved on this computer</span></label>
            )}
            <button type="button" role="menuitem" onClick={() => { setMenu(false); addLink() }}><b>Paste Google Drive link</b><span>Copy the link from Google Drive and paste it here</span></button>
          </div>
        </>}
      </div>
      {files.some(canRead) && scan.state !== 'reading' && !readerOff() && (
        <button type="button" className="btn ghost small-btn read-btn" onClick={() => read(files.filter(canRead).slice(-1)[0])}>{scan.state === 'done' ? 'Read the receipt again' : 'Fill in from receipt'}</button>
      )}
      {scan.state === 'reading' && <div className="scan-box reading" role="status"><span className="spinner" aria-hidden="true" /> Reading the receipt…</div>}
      {scan.state === 'done' && (
        <div className="scan-box done" role="status">
          <b>Filled in from the receipt.</b> Check the <span className="autofill-key">yellow</span> fields, fix anything wrong, then save.
          {scan.warn && scan.warn.length > 0 && <ul>{scan.warn.map((w) => <li key={w}>{w}</li>)}</ul>}
        </div>
      )}
      {scan.state === 'error' && <div className="scan-box error" role="status">{scan.msg}</div>}
      {!hasProof && (
        <label className="check no-receipt"><input type="checkbox" checked={nr.on} onChange={(e) => setNr({ ...nr, on: e.target.checked })} /><span>No receipt for this purchase</span></label>
      )}
      {nr.on && (
        <div className="stack reimb">
          <Field label="Why is there no receipt?" hint="e.g. Taxi, the driver had no receipt. Keep this for small amounts only."><input value={nr.reason} onChange={(e) => setNr({ ...nr, reason: e.target.value })} /></Field>
          <Field label="Approved by"><input value={nr.by} onChange={(e) => setNr({ ...nr, by: e.target.value })} /></Field>
        </div>
      )}
    </div>
  )

  return (
    <div className="stack narrow">
      <h1 className="page-title">{id ? `Edit item ${item ? s.code(item) : ''}` : 'Add expense item'}</h1>
      {!id && <p className="muted small">One item = one thing you bought (it can have several receipts). It gets its number automatically, e.g. {cat ? `${cat.letter}1, ${cat.letter}2` : 'A1, A2'}.</p>}
      <Card>
        <form className="stack" onSubmit={save}>
          {!id && proofField}
          {!id && <h2 className="form-step">2. Check the details</h2>}
          <div className={hl('category_id')}><Field label="Expense category">
            <select value={f.category_id} onChange={set('category_id')}>
              {s.categories.map((c) => <option key={c.id} value={c.id}>{c.letter} · {c.name}</option>)}
            </select>
          </Field></div>
          {id && item && f.category_id !== item.category_id && <p className="info small">Moving to another category gives this item a new number.</p>}
          <div className={hl('description')}><Field label="Description (as it appears in the report)" hint='e.g. "Magnetic tags (45 items total)"'>
            <input value={f.description} onChange={set('description')} maxLength={200} />
          </Field></div>
          <div className={hl('amount')}><Field label="Amount (HK$)" hint={cur.on ? `HK$ actually charged for the ${cur.code} payment (see the card or bank statement)` : 'Total actually paid, in HK dollars'}>
            <input inputMode="decimal" value={f.amount} onChange={set('amount')} placeholder="0.00" />
          </Field></div>
          <label className="check"><input type="checkbox" checked={cur.on} onChange={(e) => { setCur({ ...cur, on: e.target.checked }); unmark('cur') }} /><span>Paid in another currency</span></label>
          {cur.on && (
            <div className={`grid2 tight reimb ${hl('cur')}`}>
              <Field label="Currency">
                <select value={cur.code} onChange={(e) => { setCur({ ...cur, code: e.target.value }); unmark('cur') }}>
                  {[...new Set([cur.code, ...CURRENCIES])].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label={`Amount in ${cur.code}`}><input inputMode="decimal" value={cur.amount} onChange={(e) => { setCur({ ...cur, amount: e.target.value }); unmark('cur') }} placeholder="0.00" /></Field>
            </div>
          )}
          <div className="grid2 tight">
            <Field label="Purpose"><input value={f.purpose} onChange={set('purpose')} placeholder="e.g. Magnetic Tags (45 Items)" /></Field>
            <div className={hl('purchased_item')}><Field label="Purchased item"><input value={f.purchased_item} onChange={set('purchased_item')} /></Field></div>
            <div className={hl('supplier')}><Field label="Supplier"><input value={f.supplier} onChange={set('supplier')} placeholder="e.g. Tao Bao" /></Field></div>
            <Field label="Submitted by"><input value={f.submitted_by} onChange={set('submitted_by')} /></Field>
            <Field label="Date of submission"><input type="date" value={f.submitted_on} onChange={set('submitted_on')} /></Field>
          </div>
          <div className="field">
            <span className="field-label">Who paid?</span>
            <div className="seg" role="radiogroup" aria-label="Who paid">
              <button type="button" role="radio" aria-checked={!pay.member} className={!pay.member ? 'on' : ''} onClick={() => setPay({ ...pay, member: false })}>Club / project account</button>
              <button type="button" role="radio" aria-checked={pay.member} className={pay.member ? 'on' : ''} onClick={() => setPay({ ...pay, member: true, name: pay.name || f.submitted_by })}>A member, own money</button>
            </div>
            {pay.member && <div className="stack reimb">
              <Field label="Member who paid (to be reimbursed)"><input value={pay.name} onChange={(e) => setPay({ ...pay, name: e.target.value })} placeholder="e.g. McQueen" /></Field>
              <label className="check"><input type="checkbox" checked={pay.reimbursed} onChange={(e) => setPay({ ...pay, reimbursed: e.target.checked })} /><span>Already paid back</span></label>
              {pay.reimbursed && <Field label="Date paid back"><input type="date" value={pay.on} onChange={(e) => setPay({ ...pay, on: e.target.value })} /></Field>}
            </div>}
          </div>

          <div className={`field ${hl('dates')}`}>
            <span className="field-label">Date(s) of purchase</span>
            <div className="chips">
              {dates.map((d) => <span key={d} className="chip">{fmtDate(d)}<button type="button" aria-label={`Remove ${d}`} onClick={() => { setDates(dates.filter((x) => x !== d)); unmark('dates') }}>×</button></span>)}
            </div>
            <div className="row gap">
              <input type="date" value={newDate} onChange={(e) => { setNewDate(e.target.value); unmark('dates') }} aria-label="Purchase date" />
              <button type="button" className="btn ghost small-btn" onClick={() => { if (newDate && !dates.includes(newDate)) setDates([...dates, newDate].sort()); unmark('dates') }}>Add date</button>
            </div>
            <span className="field-hint">Several receipts on different days? Add each date.</span>
          </div>

          {id && proofField}

          <div className={hl('remarks')}><Field label="Remarks (optional)" hint='e.g. "Original price − refunds ($745.93 − $226.00)"'>
            <textarea rows={2} value={f.remarks} onChange={set('remarks')} />
          </Field></div>

          <ErrorBox msg={err} />
          <div className="row gap wrap between">
            {id ? <button type="button" className="btn danger-ghost" onClick={remove}>Delete item</button> : <span />}
            <div className="row gap">
              <a className="btn ghost" href={id ? `#/item/${id}` : '#/expenses'}>Cancel</a>
              <button className="btn primary" disabled={busy || scan.state === 'reading'}>{busy ? 'Saving…' : auto.size ? 'Checked, save item' : 'Save item'}</button>
            </div>
          </div>
          {f.amount && parseAmount(f.amount).n !== undefined && <p className="small muted">Amount: {hk(parseAmount(f.amount).n)}{cur.on && cur.amount ? ` (paid ${cur.code} ${cur.amount})` : ''}</p>}
        </form>
      </Card>
    </div>
  )
}
