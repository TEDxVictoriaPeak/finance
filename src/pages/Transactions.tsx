import React, { useEffect, useMemo, useState } from 'react'
import { sb, errText } from '../lib/supabase'
import { useApp } from '../lib/app'
import { PENDING, POSTED, TYPE_LABEL, csvMoney, direction, downloadCSV, fmtDate, fyEnd, fyStart, money, monthLabel } from '../lib/format'
import { Badge, Card, Empty, ErrorBox, Loading } from '../components/ui'
import EntryDetail from '../components/EntryDetail'
import { FySelect } from './Dashboard'

type Row = {
  id?: string; ref: string; txn_date: string; title: string; type: string; status: string; amount: number; in_kind: boolean
  division: string; category: string; account: string; submitter?: string; raw?: any
}

export default function Transactions() {
  const app = useApp()
  const m = app.settings?.fy_start_month || 7
  const [fy, setFy] = useState(app.currentFy)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [tab, setTab] = useState('posted')
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [div, setDiv] = useState('')
  const [view, setView] = useState<'cards' | 'table'>('cards')
  const [open, setOpen] = useState<any>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    setRows(null); setErr(null)
    if (app.staff) {
      sb.from('entries').select('*').gte('txn_date', fyStart(fy, m)).lte('txn_date', fyEnd(fy, m))
        .order('txn_date', { ascending: false }).order('created_at', { ascending: false })
        .then(({ data, error }) => {
          if (error) return setErr(errText(error))
          setRows((data || []).filter((e: any) => e.type !== 'opening').map((e: any) => ({
            id: e.id, ref: e.ref, txn_date: e.txn_date, title: e.title, type: e.type, status: e.status, amount: e.amount, in_kind: e.in_kind,
            division: e.division_id ? app.nameOf.division(e.division_id) : '', category: e.category_id ? app.nameOf.category(e.category_id) : '',
            account: e.account_id ? app.nameOf.account(e.account_id) + (e.to_account_id ? ' → ' + app.nameOf.account(e.to_account_id) : '') : '',
            submitter: e.submitter_name, raw: e,
          })))
        })
    } else {
      sb.rpc('public_entries', { p_fy: fy }).then(({ data, error }) => {
        if (error) return setErr(errText(error))
        setRows((data || []).map((e: any) => ({ ...e, division: e.division || '', category: e.category || '', account: e.account || '' })))
      })
    }
  }, [fy, app.staff, tick])

  const filtered = useMemo(() => {
    if (!rows) return []
    const ql = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (app.staff) {
        if (tab === 'posted' && !POSTED.includes(r.status)) return false
        if (tab === 'pending' && !PENDING.includes(r.status)) return false
        if (tab === 'returned' && !['returned', 'rejected'].includes(r.status)) return false
        if (tab === 'void' && r.status !== 'void') return false
      }
      if (type && r.type !== type) return false
      if (div && r.division !== div) return false
      if (ql && !`${r.ref} ${r.title} ${r.division} ${r.category} ${r.account} ${r.submitter || ''}`.toLowerCase().includes(ql)) return false
      return true
    })
  }, [rows, tab, q, type, div])

  const groups = useMemo(() => {
    const g: Record<string, Row[]> = {}
    filtered.forEach((r) => { (g[r.txn_date.slice(0, 7)] ||= []).push(r) })
    return Object.entries(g).sort((a, b) => b[0].localeCompare(a[0]))
  }, [filtered])

  const counts = useMemo(() => ({
    posted: rows?.filter((r) => POSTED.includes(r.status)).length || 0,
    pending: rows?.filter((r) => PENDING.includes(r.status)).length || 0,
    returned: rows?.filter((r) => ['returned', 'rejected'].includes(r.status)).length || 0,
    void: rows?.filter((r) => r.status === 'void').length || 0,
  }), [rows])

  const exportCsv = () => downloadCSV(`transactions-FY${fy}`, [
    ['Reference', 'Date', 'Title', 'Type', 'Status', 'Amount (HKD)', 'In-kind', 'Division', 'Category', 'Account', ...(app.staff ? ['Submitted by'] : [])],
    ...filtered.map((r) => [r.ref, r.txn_date, r.title, TYPE_LABEL[r.type], r.status, csvMoney(r.amount * (direction(r.type, r.in_kind) || 1)), r.in_kind ? 'yes' : '', r.division, r.category, r.account, ...(app.staff ? [r.submitter] : [])]),
  ])

  const divNames = Array.from(new Set((rows || []).map((r) => r.division).filter(Boolean))).sort()

  return (
    <div className="stack">
      <div className="row between wrap gap">
        <h1 className="page-title">Transactions</h1>
        <div className="row gap"><FySelect fy={fy} setFy={setFy} /><button className="btn ghost small-btn" onClick={exportCsv}>Export</button></div>
      </div>

      {app.staff && (
        <div className="tabs" role="tablist">
          {[['posted', 'Posted'], ['pending', 'Pending'], ['returned', 'Returned & rejected'], ['void', 'Void'], ['all', 'All']].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              {l}{k !== 'all' && (counts as any)[k] ? ` (${(counts as any)[k]})` : ''}
            </button>
          ))}
        </div>
      )}
      {!app.staff && <p className="muted small">Showing approved entries only. Names and receipts are visible to the committee after login.</p>}

      <div className="filters">
        <input type="search" placeholder="Search title, reference, category…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
          <option value="">All types</option>
          {['expense', 'income', 'transfer', 'sponsor_invoice', 'advance', 'advance_return'].map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
        <select value={div} onChange={(e) => setDiv(e.target.value)} aria-label="Division">
          <option value="">All divisions</option>
          {divNames.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <div className="seg small-seg">
          <button className={view === 'cards' ? 'on' : ''} onClick={() => setView('cards')}>Cards</button>
          <button className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>Table</button>
        </div>
      </div>

      <ErrorBox msg={err} />
      {!rows && !err && <Loading />}
      {rows && filtered.length === 0 && <Empty>No entries here.</Empty>}

      {groups.map(([month, list]) => {
        const inn = list.filter((r) => POSTED.includes(r.status) && direction(r.type, r.in_kind) > 0).reduce((s, r) => s + r.amount, 0)
        const out = list.filter((r) => POSTED.includes(r.status) && direction(r.type, r.in_kind) < 0).reduce((s, r) => s + r.amount, 0)
        return (
          <section key={month} className="month">
            <div className="month-head">
              <h2>{monthLabel(month)}</h2>
              <span className="small"><b className="green">{money(inn, { sign: true })}</b> · <b className="red">{money(-out, { sign: true })}</b></span>
            </div>
            {view === 'cards' ? (
              <div className="stack tight">
                {list.map((r) => {
                  const d = direction(r.type, r.in_kind)
                  return (
                    <button key={r.ref} className={`entry ${d > 0 ? 'in' : d < 0 ? 'out' : 'neutral'}`} onClick={() => app.staff && r.raw && setOpen(r.raw)} disabled={!app.staff}>
                      <div className="row between gap">
                        <span className="entry-title">{r.title}</span>
                        <b className={`entry-amt ${d > 0 ? 'green' : d < 0 ? 'red' : ''}`}>{d ? money(d * r.amount, { sign: true }) : money(r.amount)}</b>
                      </div>
                      <div className="row gap wrap">
                        <Badge tone="gray">{TYPE_LABEL[r.type]}{r.in_kind ? ' · in-kind' : ''}</Badge>
                        <Badge status={r.status} />
                      </div>
                      <span className="entry-meta">{[r.ref, fmtDate(r.txn_date), r.division, r.category, r.account, r.submitter].filter(Boolean).join(' · ')}</span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Ref</th><th>Date</th><th>Title</th><th>Division</th><th>Category</th><th>Status</th><th className="num">Amount</th></tr></thead>
                  <tbody>
                    {list.map((r) => {
                      const d = direction(r.type, r.in_kind)
                      return (
                        <tr key={r.ref} onClick={() => app.staff && r.raw && setOpen(r.raw)} className={app.staff ? 'click' : ''}>
                          <td>{r.ref}</td><td className="nowrap">{fmtDate(r.txn_date)}</td><td>{r.title}</td><td>{r.division}</td><td>{r.category}</td>
                          <td><Badge status={r.status} /></td>
                          <td className={`num ${d > 0 ? 'green' : d < 0 ? 'red' : ''}`}>{d ? money(d * r.amount, { sign: true }) : money(r.amount)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )
      })}

      {open && <EntryDetail entry={open} onClose={() => setOpen(null)} onChanged={() => setTick(tick + 1)} />}
    </div>
  )
}
