import React, { useEffect, useState } from 'react'
import { sb, errText } from '../lib/supabase'
import { useApp, Profile } from '../lib/app'
import { centsToInput, money, parseMoney } from '../lib/format'
import { Badge, Card, Empty, ErrorBox, Field, Modal, Section, useDialog } from '../components/ui'

const SUGGESTED = ['Venue', 'Production / AV', 'Speakers', 'Catering', 'Marketing & Printing', 'Merchandise', 'Licensing', 'Volunteers', 'Contingency']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export default function Settings() {
  const app = useApp()
  const [tab, setTab] = useState('divisions')
  if (!app.staff) return <Card className="hero"><h1>Settings</h1><p>Log in to manage settings.</p></Card>
  const tabs: [string, string][] = [['divisions', 'Divisions'], ['categories', 'Categories'], ['general', 'General'], ['accounts', 'Accounts'], ['users', 'Users'], ['permissions', 'Who can do what']]
  return (
    <div className="stack">
      <h1 className="page-title">Settings</h1>
      <div className="tabs scroll">{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'divisions' && <Divisions />}
      {tab === 'categories' && <Categories />}
      {tab === 'general' && <General />}
      {tab === 'accounts' && <Accounts />}
      {tab === 'users' && <Users />}
      {tab === 'permissions' && <Permissions />}
    </div>
  )
}

function NameList({ items, onAdd, onRename, onArchive, placeholder }: {
  items: { id: string; name: string; archived: boolean }[]; placeholder: string
  onAdd: (n: string) => Promise<any>; onRename: (id: string, n: string) => Promise<any>; onArchive: (id: string, a: boolean) => Promise<any>
}) {
  const dlg = useDialog()
  const [name, setName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const wrap = async (p: Promise<any>) => { const r = await p; if (r?.error) setErr(errText(r.error)); else setErr(null) }
  return (
    <Card className="list">
      <form className="row gap" onSubmit={async (e) => { e.preventDefault(); if (name.trim()) { await wrap(onAdd(name.trim())); setName('') } }}>
        <input className="grow" value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
        <button className="btn primary">Add</button>
      </form>
      <ErrorBox msg={err} />
      {items.length === 0 && <Empty>None yet.</Empty>}
      {items.map((it) => (
        <div key={it.id} className={`list-row ${it.archived ? 'muted' : ''}`}>
          <span className="grow">{it.name}{it.archived && <Badge tone="gray">Archived</Badge>}</span>
          <button className="btn ghost small-btn" onClick={async () => { const n = await dlg.ask({ title: 'Rename', label: 'New name', required: true, confirmText: 'Rename' }); if (n) wrap(onRename(it.id, n)) }}>Rename</button>
          <button className="btn ghost small-btn" onClick={() => wrap(onArchive(it.id, !it.archived))}>{it.archived ? 'Restore' : 'Archive'}</button>
        </div>
      ))}
    </Card>
  )
}

function Divisions() {
  const app = useApp()
  const done = async (r: any) => { await app.reload(); return r }
  return (
    <Section title="Divisions">
      <p className="muted small">Organizer and Project Leads can add and rename divisions. A division with transactions can only be archived (hidden from forms), never deleted, so reports stay complete.</p>
      <NameList items={app.divisions} placeholder="New division, e.g. Production"
        onAdd={async (n) => done(await sb.from('divisions').insert({ name: n, sort: app.divisions.length }))}
        onRename={async (id, n) => done(await sb.from('divisions').update({ name: n }).eq('id', id))}
        onArchive={async (id, a) => done(await sb.from('divisions').update({ archived: a }).eq('id', id))} />
    </Section>
  )
}

function Categories() {
  const app = useApp()
  const done = async (r: any) => { await app.reload(); return r }
  const exp = app.categories.filter((c) => c.kind === 'expense')
  const inc = app.categories.filter((c) => c.kind === 'income')
  const missing = SUGGESTED.filter((s) => !exp.find((c) => c.name.toLowerCase() === s.toLowerCase()))
  return (
    <>
      <Section title="Expense categories (budget lines)" right={missing.length > 0 ? <button className="btn ghost small-btn" onClick={async () => done(await sb.from('categories').insert(missing.map((name, i) => ({ name, kind: 'expense', sort: exp.length + i }))))}>Add suggested</button> : undefined}>
        <p className="muted small">Each category automatically gets its own account in the books.{missing.length > 0 ? ` Suggested: ${missing.join(', ')}.` : ''}</p>
        <NameList items={exp} placeholder="New expense category"
          onAdd={async (n) => done(await sb.from('categories').insert({ name: n, kind: 'expense', sort: exp.length }))}
          onRename={async (id, n) => done(await sb.from('categories').update({ name: n }).eq('id', id))}
          onArchive={async (id, a) => done(await sb.from('categories').update({ archived: a }).eq('id', id))} />
      </Section>
      <Section title="Income categories">
        <NameList items={inc} placeholder="New income category"
          onAdd={async (n) => done(await sb.from('categories').insert({ name: n, kind: 'income', sort: inc.length }))}
          onRename={async (id, n) => done(await sb.from('categories').update({ name: n }).eq('id', id))}
          onArchive={async (id, a) => done(await sb.from('categories').update({ archived: a }).eq('id', id))} />
      </Section>
    </>
  )
}

function General() {
  const app = useApp()
  const s = app.settings!
  const [f, setF] = useState<any>({
    ...s, single_approval_max: centsToInput(s.single_approval_max), organizer_signoff_above: centsToInput(s.organizer_signoff_above),
    receipt_required_above: centsToInput(s.receipt_required_above), sponsorship_target: centsToInput(s.sponsorship_target),
  })
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const ro = !app.finAdmin
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const save = async () => {
    setErr(null); setMsg(null)
    const row = {
      org_name: f.org_name, fy_start_month: Number(f.fy_start_month), event_date: f.event_date || null, public_dashboard: !!f.public_dashboard,
      login_domain: String(f.login_domain || '').trim().toLowerCase(),
      single_approval_max: parseMoney(f.single_approval_max) ?? 0, organizer_signoff_above: parseMoney(f.organizer_signoff_above) ?? 0,
      receipt_required_above: parseMoney(f.receipt_required_above) ?? 0, sponsorship_target: parseMoney(f.sponsorship_target) ?? 0, updated_at: new Date().toISOString(),
    }
    const { error } = await sb.from('settings').update(row).eq('id', 1)
    if (error) setErr(errText(error)); else { setMsg('Saved.'); app.reload() }
  }
  return (
    <Section title="General">
      <Card className="stack">
        {ro && <p className="info">Only the Head of Finance can change these.</p>}
        <fieldset disabled={ro} className="stack plain">
          <Field label="Name"><input value={f.org_name} onChange={set('org_name')} /></Field>
          <div className="grid2 tight">
            <Field label="Financial year starts in"><select value={f.fy_start_month} onChange={set('fy_start_month')}>{MONTHS.map((mm, i) => <option key={mm} value={i + 1}>{mm}</option>)}</select></Field>
            <Field label="Event date"><input type="date" value={f.event_date || ''} onChange={set('event_date')} /></Field>
            <Field label="Only finance approval up to (HK$)" hint="Smaller expenses skip the Project Lead step"><input inputMode="decimal" value={f.single_approval_max} onChange={set('single_approval_max')} /></Field>
            <Field label="Organizer sign-off above (HK$)"><input inputMode="decimal" value={f.organizer_signoff_above} onChange={set('organizer_signoff_above')} /></Field>
            <Field label="Receipt required above (HK$)"><input inputMode="decimal" value={f.receipt_required_above} onChange={set('receipt_required_above')} /></Field>
            <Field label="Sponsorship target (HK$)"><input inputMode="decimal" value={f.sponsorship_target} onChange={set('sponsorship_target')} /></Field>
          </div>
          <label className="check"><input type="checkbox" checked={!!f.public_dashboard} onChange={set('public_dashboard')} /><span>Public dashboard: anyone with the link can see balances and approved entries (no names or receipts)</span></label>
          <Field label="Login domain" hint={`Usernames become username@${f.login_domain}. Create accounts in Supabase with this ending.`}><input value={f.login_domain} onChange={set('login_domain')} /></Field>
        </fieldset>
        <ErrorBox msg={err} />{msg && <div className="ok-box">{msg}</div>}
        {!ro && <button className="btn primary" onClick={save}>Save settings</button>}
      </Card>
    </Section>
  )
}

function Accounts() {
  const app = useApp()
  const dlg = useDialog()
  const [err, setErr] = useState<string | null>(null)
  const cash = app.accounts.filter((a) => a.is_cash)
  const add = async () => {
    const n = await dlg.ask({ title: 'New money account', message: 'e.g. "Bank – BOC" or "Square payments"', label: 'Account name', required: true, confirmText: 'Add' })
    if (!n) return
    const code = String(Math.max(1000, ...app.accounts.filter((a) => /^1\d{3}$/.test(a.code) && Number(a.code) < 1100).map((a) => Number(a.code))) + 1)
    const { error } = await sb.from('accounts').insert({ code, name: n, type: 'asset', is_cash: true })
    if (error) setErr(errText(error)); else app.reload()
  }
  const rename = async (id: string) => {
    const n = await dlg.ask({ title: 'Rename account', label: 'New name', required: true, confirmText: 'Rename' })
    if (!n) return
    const { error } = await sb.from('accounts').update({ name: n }).eq('id', id)
    if (error) setErr(errText(error)); else app.reload()
  }
  const archive = async (id: string, a: boolean) => {
    const { error } = await sb.from('accounts').update({ archived: a }).eq('id', id)
    if (error) setErr(errText(error)); else app.reload()
  }
  return (
    <>
      <Section title="Money accounts" right={app.finAdmin ? <button className="btn primary small-btn" onClick={add}>Add account</button> : undefined}>
        <Card className="list">
          <ErrorBox msg={err} />
          {cash.map((a) => (
            <div key={a.id} className={`list-row ${a.archived ? 'muted' : ''}`}>
              <span className="grow">{a.code} · {a.name}{a.archived && <Badge tone="gray">Archived</Badge>}</span>
              {app.finAdmin && <><button className="btn ghost small-btn" onClick={() => rename(a.id)}>Rename</button><button className="btn ghost small-btn" onClick={() => archive(a.id, !a.archived)}>{a.archived ? 'Restore' : 'Archive'}</button></>}
            </div>
          ))}
        </Card>
      </Section>
      <Section title="Full chart of accounts">
        <Card className="list">
          <p className="muted small">The app posts double-entry journals to these automatically. Expense and income accounts are created when you add categories.</p>
          {app.accounts.map((a) => <div key={a.id} className="list-row"><span>{a.code} · {a.name}</span><span className="small muted">{a.type}</span></div>)}
        </Card>
      </Section>
    </>
  )
}

function Users() {
  const app = useApp()
  const [users, setUsers] = useState<Profile[]>([])
  const [edit, setEdit] = useState<Profile | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => { sb.from('profiles').select('*').order('active', { ascending: false }).order('username').then(({ data }) => setUsers(data || [])) }, [tick])
  return (
    <Section title="Users">
      <Card className="stack">
        <div className="info small">
          <b>To add a person:</b> in Supabase open <i>Authentication › Users › Add user › Create new user</i>. Email: <code>username@{app.settings?.login_domain}</code>, choose a password, tick <i>Auto Confirm User</i>. They then appear below as inactive: {app.finAdmin ? 'tap Edit to give them a role and activate them.' : 'the Head of Finance activates them.'}
        </div>
        <div className="list">
          {users.map((u) => (
            <div key={u.id} className={`list-row ${u.active ? '' : 'muted'}`}>
              <span className="grow">
                <span className="block"><b>{u.full_name || u.username}</b> <span className="small muted">@{u.username}</span></span>
                <span className="small">{app.roleLabel(u)}{u.division_id ? ` · ${app.nameOf.division(u.division_id)}` : ''}</span>
              </span>
              {!u.active && <Badge tone="gray">Inactive</Badge>}
              {app.finAdmin && <button className="btn ghost small-btn" onClick={() => setEdit(u)}>Edit</button>}
            </div>
          ))}
        </div>
      </Card>
      {edit && <UserEdit u={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); setTick(tick + 1); app.reload() }} />}
    </Section>
  )
}

function UserEdit({ u, onClose, onSaved }: { u: Profile; onClose: () => void; onSaved: () => void }) {
  const app = useApp()
  const [f, setF] = useState<any>({ ...u })
  const [err, setErr] = useState<string | null>(null)
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const save = async () => {
    const { error } = await sb.from('profiles').update({
      full_name: f.full_name, role: f.role, division_id: f.role === 'project_lead' ? f.division_id || null : null,
      is_finance_admin: !!f.is_finance_admin, is_finance_officer: !!f.is_finance_officer, active: !!f.active,
    }).eq('id', u.id)
    if (error) setErr(errText(error)); else onSaved()
  }
  return (
    <Modal title={`Edit @${u.username}`} onClose={onClose}>
      <div className="stack">
        <Field label="Full name"><input value={f.full_name} onChange={set('full_name')} /></Field>
        <Field label="Logs in with">
          <select value={f.role} onChange={set('role')}><option value="project_lead">Project Lead Login</option><option value="organizer">Organizer Login</option></select>
        </Field>
        {f.role === 'project_lead' && (
          <Field label="Division they approve" hint="Leave empty for finance team members who don't lead a division">
            <select value={f.division_id || ''} onChange={set('division_id')}><option value="">None</option>{app.divisions.filter((d) => !d.archived).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          </Field>
        )}
        <label className="check"><input type="checkbox" checked={!!f.is_finance_admin} onChange={set('is_finance_admin')} /><span>Head of Finance (Treasurer): final approval, settings, users</span></label>
        <label className="check"><input type="checkbox" checked={!!f.is_finance_officer} onChange={set('is_finance_officer')} /><span>Finance Officer: record payments, sponsors, transfers</span></label>
        <label className="check"><input type="checkbox" checked={!!f.active} onChange={set('active')} /><span>Active (can log in)</span></label>
        <ErrorBox msg={err} />
        <div className="row gap end"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></div>
      </div>
    </Modal>
  )
}

function Permissions() {
  const rows: [string, string, string, string, string, string][] = [
    ['View dashboard, balance, approved entries', '✓', '✓', '✓', '✓', '✓'],
    ['Submit expense / add income (goes to Pending)', '✓', '✓', '✓', '✓', '✓'],
    ['See names, receipts, pending items, reports', '—', '✓', '✓', '✓', '✓'],
    ['Approve expenses of own division', '—', '✓', '✓', '✓', '✓'],
    ['Approve expenses of any division', '—', '—', '—', '—', '✓'],
    ['Final approval (finance step)', '—', '—', 'Only for HoF’s own entries', '✓', 'Only for HoF’s own entries'],
    ['Sign off expenses above the Organizer limit', '—', '—', '—', '—', '✓'],
    ['Verify income', '—', '—', '✓', '✓', '✓'],
    ['Record payments, transfers, advances, sponsor invoices', '—', '—', '✓', '✓', '—'],
    ['Edit divisions, categories, budgets', '—', '✓', '✓', '✓', '✓'],
    ['Edit sponsors', '—', '—', '✓', '✓', '✓'],
    ['Void posted entries, opening balances, close months', '—', '—', '—', '✓', '—'],
    ['Settings, money accounts, users', '—', '—', '—', '✓', '—'],
  ]
  return (
    <Section title="Who can do what">
      <Card>
        <div className="table-wrap">
          <table className="table matrix">
            <thead><tr><th /><th>Public (no login)</th><th>Project Lead</th><th>Finance Officer</th><th>Head of Finance</th><th>Organizer</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r[0]}>{r.map((c, i) => i === 0 ? <td key={i}>{c}</td> : <td key={i} className="center">{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
        <p className="small muted">Nobody can approve their own submission. Finance Officer and Head of Finance log in through Project Lead Login.</p>
      </Card>
    </Section>
  )
}
