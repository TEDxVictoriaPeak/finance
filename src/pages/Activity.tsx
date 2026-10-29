import React, { useEffect, useState } from 'react'
import { sb } from '../lib/supabase'
import { useApp } from '../lib/app'
import { fmtDateTime } from '../lib/format'
import { Card, Empty, Loading } from '../components/ui'

const describe = (r: any) => {
  if (r.entity === 'entry') return `${r.action.replace(/_/g, ' ')} ${r.entity_id}${r.details?.note ? ` – “${r.details.note}”` : ''}`
  if (r.action === 'update' && r.details?.old && r.details?.new) {
    const changed = Object.keys(r.details.new).filter((k) => k !== 'updated_at' && JSON.stringify(r.details.new[k]) !== JSON.stringify(r.details.old[k]))
    return `changed ${r.entity.replace(/s$/, '')} ${r.details.new.name || r.details.new.username || ''}: ${changed.join(', ') || 'no visible change'}`
  }
  return `${r.action} ${r.entity.replace(/s$/, '')} ${r.details?.name || r.details?.username || r.entity_id || ''}`
}

export default function Activity() {
  const app = useApp()
  const [rows, setRows] = useState<any[] | null>(null)
  const [limit, setLimit] = useState(100)
  useEffect(() => { if (app.staff) sb.from('activity_log').select('*').order('at', { ascending: false }).limit(limit).then(({ data }) => setRows(data || [])) }, [app.staff, limit])
  if (!app.staff) return <Card className="hero"><h1>Activity log</h1><p>Log in to see the activity log.</p></Card>
  return (
    <div className="stack">
      <h1 className="page-title">Activity log</h1>
      <p className="muted small">Every change is recorded here and cannot be edited.</p>
      {!rows && <Loading />}
      {rows && rows.length === 0 && <Empty>No activity yet.</Empty>}
      <Card className="list">
        {rows?.map((r) => (
          <div key={r.id} className="list-row">
            <span className="grow"><span className="block">{r.actor_name || 'System'} {describe(r)}</span><span className="small muted">{fmtDateTime(r.at)}</span></span>
          </div>
        ))}
      </Card>
      {rows && rows.length >= limit && <button className="btn ghost" onClick={() => setLimit(limit + 200)}>Load more</button>}
    </div>
  )
}
