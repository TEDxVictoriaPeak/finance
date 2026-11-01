import React, { useEffect, useState } from 'react'
import { sb, errText } from '../lib/supabase'
import { hk, Item, signedUrls, useStore } from '../lib/store'
import { fmtDate, fmtDateTime } from '../lib/format'
import { ErrorBox, Loading } from '../components/ui'

/** The printable item sheet, like "ITEM A2.docx" */
export function ItemSheet({ item, urls }: { item: Item; urls: Record<string, string> }) {
  const s = useStore()
  const cat = s.catOf(item.category_id)
  const rows: [string, React.ReactNode][] = [
    ['Expense Category', cat?.name || '—'],
    ['Submitted by', item.submitted_by || '—'],
    ['Date of Submission', item.submitted_on ? fmtDate(item.submitted_on) : '—'],
    ['Purpose', item.purpose || item.description],
    ['Purchased Item', item.purchased_item || '—'],
    ['Supplier', item.supplier || '—'],
    ['Date of Purchase', item.purchase_dates?.length ? item.purchase_dates.map(fmtDate).join(', ') : '—'],
    ['Amount (HK$)', hk(item.amount).replace('HK$', '')],
  ]
  if (item.remarks) rows.push(['Remarks', item.remarks])
  return (
    <article className="sheet">
      <div className="sheet-head">
        <h2>ITEM {s.code(item)}</h2>
        <span>{s.project?.project_name} · {s.project?.club_name}</span>
      </div>
      <p className="sheet-desc">{item.description}</p>
      <table className="sheet-table"><tbody>{rows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody></table>
      <h3 className="sheet-sub">Payment proof</h3>
      {item.proof_paths?.length ? (
        <div className="sheet-proofs">
          {item.proof_paths.map((p, k) => (
            <figure key={p}>
              {p.endsWith('.pdf')
                ? <a href={urls[p]} target="_blank" rel="noreferrer" className="pdf big">Open PDF proof {k + 1}</a>
                : urls[p] ? <img src={urls[p]} alt={`Payment proof ${k + 1}`} /> : <span className="pdf">Loading…</span>}
              <figcaption>Proof {k + 1}{item.purchase_dates?.[k] ? ` · purchase date ${fmtDate(item.purchase_dates[k])}` : ''}</figcaption>
            </figure>
          ))}
        </div>
      ) : <p className="sheet-missing">No payment proof attached yet.</p>}
    </article>
  )
}

export default function ItemView({ id }: { id: string }) {
  const s = useStore()
  const [item, setItem] = useState<Item | null>(null)
  const [nav, setNav] = useState<{ prev?: string; next?: string }>({})
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    setItem(null)
    sb.from('exp_items').select('*').then(async ({ data, error }) => {
      if (error) return setErr(errText(error))
      const all = ((data as Item[]) || []).sort((a, b) => s.code(a).localeCompare(s.code(b), undefined, { numeric: true }))
      const k = all.findIndex((x) => x.id === id)
      if (k < 0) return setErr('Item not found. It may have been deleted.')
      setNav({ prev: all[k - 1]?.id, next: all[k + 1]?.id })
      setUrls(await signedUrls(all[k].proof_paths || []))
      setItem(all[k])
    })
  }, [id])

  if (err) return <ErrorBox msg={err} />
  if (!item) return <Loading />
  return (
    <div className="stack">
      <div className="row between wrap gap no-print">
        <a href="#/expenses" className="small">‹ All expenses</a>
        <div className="row gap wrap">
          {nav.prev && <a className="btn ghost small-btn" href={`#/item/${nav.prev}`}>‹ Previous</a>}
          {nav.next && <a className="btn ghost small-btn" href={`#/item/${nav.next}`}>Next ›</a>}
          <button className="btn ghost small-btn" onClick={() => window.print()}>Print / Save PDF</button>
          <a className="btn primary small-btn" href={`#/item/${id}/edit`}>Edit</a>
        </div>
      </div>
      <ItemSheet item={item} urls={urls} />
      <p className="small muted no-print">Added by {item.created_by_name || '—'} · {fmtDateTime(item.created_at)}{item.updated_at !== item.created_at ? ` · last changed by ${item.updated_by_name || '—'} · ${fmtDateTime(item.updated_at)}` : ''}</p>
    </div>
  )
}
