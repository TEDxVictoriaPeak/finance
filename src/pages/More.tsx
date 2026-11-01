import React, { useState } from 'react'
import { sb, errText } from '../lib/supabase'
import { useStore } from '../lib/store'
import { Card, ErrorBox, Field } from '../components/ui'

export default function More() {
  const s = useStore()
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  if (!s.staff) return <Card className="hero"><h1>Finance</h1><a className="btn primary" href="#/login">Log in</a></Card>
  const change = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setMsg(null)
    if (p1.length < 8) return setErr('Use at least 8 characters.')
    if (p1 !== p2) return setErr('The two passwords are different.')
    const { error } = await sb.auth.updateUser({ password: p1 })
    if (error) setErr(errText(error)); else { setMsg('Password changed.'); setP1(''); setP2('') }
  }
  return (
    <div className="stack narrow">
      <Card className="list">
        {[['#/funding', 'Funding', 'Club underwriting, sponsors, tickets'], ['#/print', 'Print item sheets', 'All sheets with screenshots, as one PDF'], ['#/settings', 'Settings', 'Project, categories, team']].map(([h, t, sub]) => (
          <a key={h} href={h} className="list-row link-row"><span className="grow"><span className="block"><b>{t}</b></span><span className="small muted">{sub}</span></span><span aria-hidden="true">›</span></a>
        ))}
      </Card>
      <Card>
        <h2 className="report-title">{s.profile!.full_name || s.profile!.username}</h2>
        <form className="stack" onSubmit={change}>
          <Field label="New password"><input type="password" value={p1} onChange={(e) => setP1(e.target.value)} autoComplete="new-password" /></Field>
          <Field label="Repeat new password"><input type="password" value={p2} onChange={(e) => setP2(e.target.value)} autoComplete="new-password" /></Field>
          <ErrorBox msg={err} />{msg && <div className="ok-box">{msg}</div>}
          <div className="row gap"><button className="btn primary">Change password</button><button type="button" className="btn ghost" onClick={s.signOut}>Log out</button></div>
        </form>
      </Card>
    </div>
  )
}
