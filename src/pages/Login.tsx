import React, { useState } from 'react'
import { sb, errText } from '../lib/supabase'
import { useStore } from '../lib/store'
import { Card, ErrorBox, Field } from '../components/ui'

export default function Login() {
  const s = useStore()
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (s.staff) {
    return <Card className="hero"><h1>You are logged in</h1><p>{s.profile!.full_name || s.profile!.username}</p><div className="row gap"><a className="btn primary" href="#/expenses">Go to expenses</a><button className="btn ghost" onClick={s.signOut}>Log out</button></div></Card>
  }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null)
    const u = user.trim().toLowerCase()
    if (!u || !pass) return setErr('Enter your username and password.')
    setBusy(true)
    const { data, error } = await sb.auth.signInWithPassword({ email: u.includes('@') ? u : `${u}@${s.loginDomain}`, password: pass })
    if (error) { setBusy(false); return setErr(errText(error)) }
    const { data: prof } = await sb.from('profiles').select('active').eq('id', data.user.id).maybeSingle()
    if (!prof?.active) { await sb.auth.signOut(); setBusy(false); return setErr('This account is not active yet. Ask the Head of Finance to activate it in Settings.') }
    await s.reload(); setBusy(false); location.hash = '#/expenses'
  }
  return (
    <div className="narrow stack">
      <Card>
        <h1 className="page-title">Log in</h1>
        <p className="muted small">For the finance team and the organizer.</p>
        <form className="stack" onSubmit={submit}>
          <Field label="Username"><input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" autoCapitalize="none" /></Field>
          <Field label="Password"><input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" /></Field>
          <ErrorBox msg={err} />
          <button className="btn primary big" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
        </form>
      </Card>
    </div>
  )
}
