import React, { useState } from 'react'
import { sb, errText } from '../lib/supabase'
import { useApp } from '../lib/app'
import { Card, ErrorBox, Field } from '../components/ui'

export default function Login({ kind }: { kind: 'organizer' | 'project_lead' }) {
  const app = useApp()
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const label = kind === 'organizer' ? 'Organizer Login' : 'Project Lead Login'

  if (app.staff) {
    return (
      <Card className="hero">
        <h1>You are logged in</h1>
        <p>{app.profile!.full_name || app.profile!.username} · {app.roleLabel(app.profile)}</p>
        <div className="row gap wrap"><a className="btn primary" href="#/approvals">Go to approvals</a><button className="btn ghost" onClick={app.signOut}>Log out</button></div>
      </Card>
    )
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    const u = user.trim().toLowerCase()
    if (!u || !pass) return setErr('Enter your username and password.')
    const email = u.includes('@') ? u : `${u}@${app.settings?.login_domain || 'finance.tedxvictoriapeak.com'}`
    setBusy(true)
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pass })
    if (error) { setBusy(false); return setErr(errText(error)) }
    const { data: prof } = await sb.from('profiles').select('*').eq('id', data.user.id).maybeSingle()
    if (!prof || !prof.active) {
      await sb.auth.signOut(); setBusy(false)
      return setErr('Your account is not active yet. Ask the Head of Finance to activate it in Settings › Users.')
    }
    if (prof.role !== kind) {
      await sb.auth.signOut(); setBusy(false)
      return setErr(kind === 'organizer'
        ? 'This account is not an Organizer account. Use Project Lead Login instead.'
        : 'This is an Organizer account. Use Organizer Login instead.')
    }
    await app.reload()
    setBusy(false)
    location.hash = '#/approvals'
  }

  return (
    <div className="narrow stack">
      <div className="seg" role="tablist">
        <a href="#/login/organizer" className={kind === 'organizer' ? 'on' : ''} role="tab" aria-selected={kind === 'organizer'}>Organizer Login</a>
        <a href="#/login/lead" className={kind === 'project_lead' ? 'on' : ''} role="tab" aria-selected={kind === 'project_lead'}>Project Lead Login</a>
      </div>
      <Card>
        <h1 className="page-title">{label}</h1>
        <p className="muted small">{kind === 'organizer'
          ? 'For the event Organizer: approve any division and sign off large expenses.'
          : 'For Project Leads, the Head of Finance and the Finance Officer.'} Everyone else can use the site without logging in.</p>
        <form className="stack" onSubmit={submit}>
          <Field label="Username"><input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" autoCapitalize="none" autoCorrect="off" /></Field>
          <Field label="Password"><input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" /></Field>
          <ErrorBox msg={err} />
          <button className="btn primary big" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
        </form>
        <p className="small muted">Forgot your password? Ask the Head of Finance to reset it.</p>
      </Card>
    </div>
  )
}
