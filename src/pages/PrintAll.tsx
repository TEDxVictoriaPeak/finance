import React, { useEffect, useState } from 'react'
import { sb, errText } from '../lib/supabase'
import { Item, signedUrls, useStore } from '../lib/store'
import { Empty, ErrorBox, Loading } from '../components/ui'
import { ItemSheet } from './ItemView'

export default function PrintAll() {
  const s = useStore()
  const [items, setItems] = useState<Item[] | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [cat, setCat] = useState('')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    sb.from('exp_items').select('*').then(async ({ data, error }) => {
      if (error) return setErr(errText(error))
      const all = ((data as Item[]) || []).sort((a, b) => s.code(a).localeCompare(s.code(b), undefined, { numeric: true }))
      setUrls(await signedUrls(all.flatMap((i) => i.proof_paths || [])))
      setItems(all)
    })
  }, [])

  if (err) return <ErrorBox msg={err} />
  if (!items) return <Loading />
  const list = items.filter((i) => !cat || i.category_id === cat)
  return (
    <div className="stack">
      <div className="no-print stack">
        <h1 className="page-title">Print item sheets</h1>
        <p className="muted small">Every item on its own page, with its screenshots. Choose Print, then "Save as PDF" to get one file with all sheets.</p>
        <div className="row gap wrap">
          <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category" style={{ width: 'auto' }}>
            <option value="">All categories ({items.length} items)</option>
            {s.categories.map((c) => <option key={c.id} value={c.id}>{c.letter} · {c.name}</option>)}
          </select>
          <button className="btn primary" onClick={() => window.print()} disabled={!list.length}>Print / Save PDF</button>
        </div>
      </div>
      {list.length === 0 && <Empty>No items to print.</Empty>}
      {list.map((i) => <div key={i.id} className="page-break"><ItemSheet item={i} urls={urls} /></div>)}
    </div>
  )
}
