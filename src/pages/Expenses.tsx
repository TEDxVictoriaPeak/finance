import React, { useEffect, useMemo, useState } from 'react'
import { sb, errText } from '../lib/supabase'
import { hk, Item, useStore } from '../lib/store'
import { fmtDate } from '../lib/format'
import { Card, Empty, ErrorBox, Loading } from '../components/ui'

export function useItems() {
  const [items, setItems] = useState<Item[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const load = () => sb.from('exp_items').select('*').order('seq').then(({ data, error }) => (error ? setErr(errText(error)) : setItems((data as Item[]) || [])))
  useEffect(() => { load() }, [])
  return { items, err, load }
}

export default function Expenses() {
  const s = useStore()
  const { items, err } = useItems()
  const [q, setQ] = useState('')
  const groups = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return s.categories.map((c) => {
      const list = (items || []).filter((i) => i.category_id === c.id)
        .filter((i) => !ql || `${s.code(i)} ${i.description} ${i.supplier || ''} ${i.submitted_by || ''} ${i.purpose || ''}`.toLowerCase().includes(ql))
        .sort((a, b) => a.seq - b.seq)
      return { c, list, sum: list.reduce((t, i) => t + Number(i.amount), 0) }
    })
  }, [items, q, s.categories])
  const total = (items || []).reduce((t, i) => t + Number(i.amount), 0)

  return (
    <div className="stack">
      <div className="row between wrap gap">
        <h1 className="page-title">Expenses</h1>
        <a className="btn primary small-btn" href="#/add">Add expense</a>
      </div>
      <p className="muted small">One row per item. Tap an item to see its sheet with the payment screenshots. Total: <b>{hk(total)}</b></p>
      <input type="search" placeholder="Search code, item, supplier, name…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
      <ErrorBox msg={err} />
      {!items && !err && <Loading />}
      {items && groups.map(({ c, list, sum }) => (
        <section key={c.id} className="section">
          <div className="cat-head"><h2><span className="cat-letter">{c.letter}</span> {c.name}</h2><b>{hk(sum)}</b></div>
          <Card className="list">
            {list.length === 0 && <Empty>No items in this category{q ? ' match your search' : ''}.</Empty>}
            {list.map((i) => (
              <a key={i.id} href={`#/item/${i.id}`} className="list-row link-row item-row">
                <span className="code-pill">{s.code(i)}</span>
                <span className="grow">
                  <span className="block">{i.description}</span>
                  <span className="small muted">{[i.supplier, i.purchase_dates?.length ? i.purchase_dates.map(fmtDate).join(', ') : null, i.submitted_by].filter(Boolean).join(' · ')}</span>
                </span>
                {i.proof_paths?.length ? <span className="badge green">{i.proof_paths.length} proof{i.proof_paths.length > 1 ? 's' : ''}</span> : <span className="badge amber">No proof</span>}
                <b className="nowrap">{hk(i.amount)}</b>
              </a>
            ))}
          </Card>
        </section>
      ))}
    </div>
  )
}
