import React, { useEffect, useState } from 'react'
import { sb, errText } from '../lib/supabase'
import { hk, Item, signedUrls, useStore } from '../lib/store'
import { fmtDate, today } from '../lib/format'
import { Card, ErrorBox, Field, Loading, useDialog } from '../components/ui'

export default function ItemForm({ id }: { id?: string }) {
  const s = useStore()
  const dlg = useDialog()
  const [item, setItem] = useState<Item | null>(null)
  const [loaded, setLoaded] = useState(!id)
  const [f, setF] = useState({
    category_id: '', description: '', amount: '', purpose: '', purchased_item: '', supplier: '',
    submitted_by: s.profile?.full_name || '', submitted_on: today(), remarks: '',
  })
  const [dates, setDates] = useState<string[]>([])
  const [newDate, setNewDate] = useState(today())
  const [keep, setKeep] = useState<string[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value })

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
      setDates(it.purchase_dates || [])
      setKeep(it.proof_paths || [])
      setUrls(await signedUrls(it.proof_paths || []))
      setLoaded(true)
    })
  }, [id])

  const previews = files.map((file) => ({ file, url: URL.createObjectURL(file) }))

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null)
    const amount = Number(String(f.amount).replace(/[^0-9.]/g, ''))
    if (!f.category_id) return setErr('Choose a category.')
    if (!f.description.trim()) return setErr('Write a short description, e.g. "Magnetic tags (45 items total)".')
    if (!amount || amount <= 0) return setErr('Enter the amount in HK$.')
    const allDates = newDate && !dates.includes(newDate) && dates.length === 0 ? [newDate] : dates
    setBusy(true)
    try {
      const itemId = id || crypto.randomUUID()
      const uploaded: string[] = []
      for (const file of files) {
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
        const path = `items/${itemId}/${crypto.randomUUID()}.${ext}`
        const { error } = await sb.storage.from('receipts').upload(path, file, { contentType: file.type || undefined })
        if (error) throw error
        uploaded.push(path)
      }
      const row = {
        category_id: f.category_id, description: f.description.trim(), amount: Math.round(amount * 100) / 100,
        purpose: f.purpose.trim() || null, purchased_item: f.purchased_item.trim() || null, supplier: f.supplier.trim() || null,
        submitted_by: f.submitted_by.trim() || null, submitted_on: f.submitted_on || null, remarks: f.remarks.trim() || null,
        purchase_dates: [...allDates].sort(), proof_paths: [...keep, ...uploaded],
      }
      const { error } = id ? await sb.from('exp_items').update(row).eq('id', id) : await sb.from('exp_items').insert({ id: itemId, ...row })
      if (error) throw error
      const removed = (item?.proof_paths || []).filter((p) => !keep.includes(p))
      if (removed.length) await sb.storage.from('receipts').remove(removed)
      location.hash = `#/item/${itemId}`
    } catch (x) { setErr(errText(x)) }
    setBusy(false)
  }

  const remove = async () => {
    const ok = await dlg.ask({ title: `Delete item ${item ? s.code(item) : ''}?`, message: 'The item and its screenshots are deleted. Other item numbers stay the same. This is recorded in the activity log.', input: false, confirmText: 'Delete', danger: true })
    if (!ok || !id) return
    const { error } = await sb.from('exp_items').delete().eq('id', id)
    if (error) return setErr(errText(error))
    if (item?.proof_paths?.length) await sb.storage.from('receipts').remove(item.proof_paths)
    location.hash = '#/expenses'
  }

  if (!loaded) return <Loading />
  const cat = s.catOf(f.category_id)

  return (
    <div className="stack narrow">
      <h1 className="page-title">{id ? `Edit item ${item ? s.code(item) : ''}` : 'Add expense item'}</h1>
      {!id && <p className="muted small">One item = one thing you bought (it can have several receipts). It gets its number automatically, e.g. {cat ? `${cat.letter}1, ${cat.letter}2` : 'A1, A2'}.</p>}
      <Card>
        <form className="stack" onSubmit={save}>
          <Field label="Expense category">
            <select value={f.category_id} onChange={set('category_id')}>
              {s.categories.map((c) => <option key={c.id} value={c.id}>{c.letter} · {c.name}</option>)}
            </select>
          </Field>
          {id && item && f.category_id !== item.category_id && <p className="info small">Moving to another category gives this item a new number.</p>}
          <Field label="Description (as it appears in the report)" hint='e.g. "Magnetic tags (45 items total)"'>
            <input value={f.description} onChange={set('description')} maxLength={200} />
          </Field>
          <Field label="Amount (HK$)" hint="Total actually paid, in HK dollars">
            <input inputMode="decimal" value={f.amount} onChange={set('amount')} placeholder="0.00" />
          </Field>
          <div className="grid2 tight">
            <Field label="Purpose"><input value={f.purpose} onChange={set('purpose')} placeholder="e.g. Magnetic Tags (45 Items)" /></Field>
            <Field label="Purchased item"><input value={f.purchased_item} onChange={set('purchased_item')} /></Field>
            <Field label="Supplier"><input value={f.supplier} onChange={set('supplier')} placeholder="e.g. Tao Bao" /></Field>
            <Field label="Submitted by"><input value={f.submitted_by} onChange={set('submitted_by')} /></Field>
            <Field label="Date of submission"><input type="date" value={f.submitted_on} onChange={set('submitted_on')} /></Field>
          </div>

          <div className="field">
            <span className="field-label">Date(s) of purchase</span>
            <div className="chips">
              {dates.map((d) => <span key={d} className="chip">{fmtDate(d)}<button type="button" aria-label={`Remove ${d}`} onClick={() => setDates(dates.filter((x) => x !== d))}>×</button></span>)}
            </div>
            <div className="row gap">
              <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} aria-label="Purchase date" />
              <button type="button" className="btn ghost small-btn" onClick={() => newDate && !dates.includes(newDate) && setDates([...dates, newDate].sort())}>Add date</button>
            </div>
            <span className="field-hint">Several receipts on different days? Add each date.</span>
          </div>

          <div className="field">
            <span className="field-label">Payment proof (screenshots or PDF)</span>
            <span className="field-hint">Proof that the money was paid (order screenshot, receipt, bank transfer). An invoice or quotation alone is not proof.</span>
            <div className="thumbs">
              {keep.map((p) => (
                <div key={p} className="thumb">
                  {urls[p] ? (p.endsWith('.pdf') ? <a href={urls[p]} target="_blank" rel="noreferrer" className="pdf">PDF</a> : <img src={urls[p]} alt="Payment proof" />) : <span className="pdf">…</span>}
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
            <input type="file" accept="image/*,application/pdf" multiple onChange={(e) => { setFiles([...files, ...Array.from(e.target.files || [])]); e.target.value = '' }} />
          </div>

          <Field label="Remarks (optional)" hint='e.g. "Original price − refunds ($745.93 − $226.00)"'>
            <textarea rows={2} value={f.remarks} onChange={set('remarks')} />
          </Field>

          <ErrorBox msg={err} />
          <div className="row gap wrap between">
            {id ? <button type="button" className="btn danger-ghost" onClick={remove}>Delete item</button> : <span />}
            <div className="row gap">
              <a className="btn ghost" href={id ? `#/item/${id}` : '#/expenses'}>Cancel</a>
              <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save item'}</button>
            </div>
          </div>
          {f.amount && <p className="small muted">Amount: {hk(Number(String(f.amount).replace(/[^0-9.]/g, '')))}</p>}
        </form>
      </Card>
    </div>
  )
}
