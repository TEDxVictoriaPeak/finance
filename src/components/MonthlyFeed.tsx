import React, { useEffect, useMemo, useState } from 'react'
import { sb, errText } from '../lib/supabase'
import { useApp } from '../lib/app'
import { fmtDate, fyEnd, fyStart, money, monthLabel } from '../lib/format'
import { Badge, Empty, ErrorBox, Loading } from './ui'
import EntryDetail from './EntryDetail'

// One small seasonal picture per month (Hong Kong seasons and holidays)
const MONTH_EMOJI = ['🎆', '🧧', '🌸', '🌷', '🌼', '☀️', '🏖️', '🌻', '🍂', '🎃', '🍁', '🎄']

type Item = {
  key: string; ref: string; date: string; title: string; type: 'income' | 'expense'; status: string; amount: number
  inKind: boolean; category: string; division: string; account: string; submitter: string; raw?: any
}

/** Income and expenses grouped by month, income on the left and expenses on the right. */
export default function MonthlyFeed({ fy }: { fy: number }) {
  const app = useApp()
  const m = app.settings?.fy_start_month || 7
  const [items, setItems] = useState<Item[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [open, setOpen] = useState<any>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    setItems(null); setErr(null)
    if (app.staff) {
      sb.from('entries').select('*').in('type', ['income', 'expense']).not('status', 'in', '(void,rejected)')
        .gte('txn_date', fyStart(fy, m)).lte('txn_date', fyEnd(fy, m))
        .order('txn_date', { ascending: false }).order('created_at', { ascending: false })
        .then(({ data, error }) => {
          if (error) return setErr(errText(error))
          setItems((data || []).map((e: any) => ({
            key: e.id, ref: e.ref, date: e.txn_date, title: e.title, type: e.type, status: e.status, amount: e.amount, inKind: e.in_kind,
            category: e.category_id ? app.nameOf.category(e.category_id) : '', division: e.division_id ? app.nameOf.division(e.division_id) : '',
            account: e.account_id ? app.nameOf.account(e.account_id) : '', submitter: e.submitter_name || '', raw: e,
          })))
        })
    } else {
      sb.rpc('public_entries', { p_fy: fy }).then(({ data, error }) => {
        if (error) return setErr(errText(error))
        setItems((data || []).filter((e: any) => e.type === 'income' || e.type === 'expense').map((e: any) => ({
          key: e.ref, ref: e.ref, date: e.txn_date, title: e.title, type: e.type, status: e.status, amount: e.amount, inKind: e.in_kind,
          category: e.category || '', division: e.division || '', account: e.account || '', submitter: '',
        })))
      })
    }
  }, [fy, app.staff, tick])

  const months = useMemo(() => {
    const g: Record<string, Item[]> = {}
    ;(items || []).forEach((it) => { (g[it.date.slice(0, 7)] ||= []).push(it) })
    return Object.entries(g).sort((a, b) => b[0].localeCompare(a[0]))
  }, [items])

  const Card = ({ it }: { it: Item }) => {
    const inc = it.type === 'income'
    const meta = [fmtDate(it.date), it.category, it.division, it.account].filter(Boolean).join(' · ')
    return (
      <button className={`entry feed-card ${inc ? 'in' : 'out'}`} onClick={() => it.raw && setOpen(it.raw)} disabled={!it.raw}>
        <div className="row between gap">
          <span className="entry-title">{it.title}</span>
          <b className={`entry-amt ${inc ? 'green' : 'red'}`}>{money(inc ? it.amount : -it.amount, { sign: true })}</b>
        </div>
        <span className="entry-meta">
          {meta}
          {it.submitter && <> · <span className="who">{it.submitter}</span></>}
        </span>
        <div className="row gap wrap">
          <Badge status={it.status} />
          {it.inKind && <Badge tone="gray">In-kind</Badge>}
        </div>
      </button>
    )
  }

  return (
    <section className="section">
      <div className="section-head">
        <h2>Submissions this year</h2>
        {items && <span className="small muted">{items.length} {items.length === 1 ? 'entry' : 'entries'}</span>}
      </div>
      {!app.staff && <p className="small muted">Approved entries only. Pending items and names are visible to the committee after login.</p>}
      <ErrorBox msg={err} />
      {!items && !err && <Loading />}
      {items && items.length === 0 && <Empty>No income or expenses yet this year.</Empty>}

      {months.map(([month, list]) => {
        const inc = list.filter((x) => x.type === 'income')
        const exp = list.filter((x) => x.type === 'expense')
        const mi = Number(month.slice(5, 7)) - 1
        return (
          <div key={month} className="feed-month">
            <div className="feed-month-head">
              <span className="feed-emoji" aria-hidden="true">{MONTH_EMOJI[mi]}</span>
              <h3>{monthLabel(month)}</h3>
              <span className="feed-line" />
            </div>
            <div className="feed-cols">
              <div className="feed-col">
                <div className="feed-label green">INCOME</div>
                {inc.length === 0 ? <p className="feed-none">No income this month</p> : inc.map((it) => <Card key={it.key} it={it} />)}
              </div>
              <div className="feed-col">
                <div className="feed-label red">EXPENSES</div>
                {exp.length === 0 ? <p className="feed-none">No expenses this month</p> : exp.map((it) => <Card key={it.key} it={it} />)}
              </div>
            </div>
          </div>
        )
      })}

      {open && <EntryDetail entry={open} onClose={() => setOpen(null)} onChanged={() => setTick(tick + 1)} />}
    </section>
  )
}
