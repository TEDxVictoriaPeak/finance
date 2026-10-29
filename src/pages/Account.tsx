import React, { useState } from 'react'
import { sb, errText } from '../lib/supabase'
import { useApp } from '../lib/app'
import { Card, ErrorBox, Field } from '../components/ui'

export default function Account() {
  const app = useApp()
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  if (!app.staff) return <Card className="hero"><h1>Not logged in</h1><a className="btn primary" href="#/login/lead">Project Lead Login</a></Card>
  const change = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setMsg(null)
    if (p1.length < 8) return setErr('Use at least 8 characters.')
    if (p1 !== p2) return setErr('The two passwords are different.')
    const { error } = await sb.auth.updateUser({ password: p1 })
    if (error) setErr(errText(error)); else { setMsg('Password changed.'); setP1(''); setP2('') }
  }
  return (
    <div className="narrow stack">
      <Card>
        <h1 className="page-title">{app.profile!.full_name || app.profile!.username}</h1>
        <p className="muted">@{app.profile!.username} · {app.roleLabel(app.profile)}{app.profile!.division_id ? ` · ${app.nameOf.division(app.profile!.division_id)}` : ''}</p>
        <button className="btn ghost" onClick={app.signOut}>Log out</button>
      </Card>
      <Card>
        <h2 className="report-title">Change password</h2>
        <form className="stack" onSubmit={change}>
          <Field label="New password"><input type="password" value={p1} onChange={(e) => setP1(e.target.value)} autoComplete="new-password" /></Field>
          <Field label="Repeat new password"><input type="password" value={p2} onChange={(e) => setP2(e.target.value)} autoComplete="new-password" /></Field>
          <ErrorBox msg={err} />{msg && <div className="ok-box">{msg}</div>}
          <button className="btn primary">Change password</button>
        </form>
      </Card>
    </div>
  )
}
