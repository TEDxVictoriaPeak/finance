import React, { useEffect, useState } from 'react'
import { sb, errText } from '../lib/supabase'
import { Profile, useStore } from '../lib/store'
import { Badge, Card, ErrorBox, Field, Section, useDialog } from '../components/ui'

export default function Settings() {
  const s = useStore()
  const dlg = useDialog()
  const [p, setP] = useState({ project_name: s.project?.project_name || '', club_name: s.project?.club_name || '', public_view: !!s.project?.public_view })
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [team, setTeam] = useState<Profile[]>([])
  const [tick, setTick] = useState(0)
  useEffect(() => { sb.from('profiles').select('*').order('username').then(({ data }) => setTeam((data as Profile[]) || [])) }, [tick])

  const saveProject = async () => {
    setErr(null); setMsg(null)
    const { error } = await sb.from('project').update({ ...p, updated_at: new Date().toISOString() }).eq('id', 1)
    if (error) setErr(errText(error)); else { setMsg('Saved.'); s.reload() }
  }
  const nextLetter = () => {
    const used = new Set(s.categories.map((c) => c.letter))
    for (let i = 0; i < 26; i++) { const L = String.fromCharCode(65 + i); if (!used.has(L)) return L }
    return 'Z'
  }
  const addCat = async () => {
    const name = await dlg.ask({ title: `New category ${nextLetter()}`, label: 'Category name', required: true, confirmText: 'Add' })
    if (!name) return
    const { error } = await sb.from('exp_categories').insert({ letter: nextLetter(), name })
    if (error) setErr(errText(error)); else s.reload()
  }
  const renameCat = async (id: string, cur: string) => {
    const name = await dlg.ask({ title: 'Rename category', message: `Now: ${cur}`, label: 'New name', required: true, confirmText: 'Save' })
    if (!name) return
    const { error } = await sb.from('exp_categories').update({ name }).eq('id', id)
    if (error) setErr(errText(error)); else s.reload()
  }
  const delCat = async (id: string, name: string) => {
    const ok = await dlg.ask({ title: `Delete "${name}"?`, message: 'Only possible when the category has no items.', input: false, confirmText: 'Delete', danger: true })
    if (!ok) return
    const { error } = await sb.from('exp_categories').delete().eq('id', id)
    if (error) setErr(/foreign key/i.test(error.message) ? 'This category still has items. Move or delete them first.' : errText(error)); else s.reload()
  }
  const editMember = async (u: Profile) => {
    const name = await dlg.ask({ title: `@${u.username}`, message: 'Full name shown in the app', label: 'Full name', required: true, confirmText: 'Save' })
    if (!name) return
    const { error } = await sb.from('profiles').update({ full_name: name }).eq('id', u.id)
    if (error) setErr(errText(error)); else setTick(tick + 1)
  }
  const toggleMember = async (u: Profile) => {
    const { error } = await sb.from('profiles').update({ active: !u.active }).eq('id', u.id)
    if (error) setErr(errText(error)); else setTick(tick + 1)
  }

  return (
    <div className="stack narrow">
      <h1 className="page-title">Settings</h1>
      <ErrorBox msg={err} />
      <Section title="Project">
        <Card className="stack">
          <Field label="Project name"><input value={p.project_name} onChange={(e) => setP({ ...p, project_name: e.target.value })} /></Field>
          <Field label="Club / organizer name"><input value={p.club_name} onChange={(e) => setP({ ...p, club_name: e.target.value })} /></Field>
          <label className="check"><input type="checkbox" checked={p.public_view} onChange={(e) => setP({ ...p, public_view: e.target.checked })} /><span>Anyone with the link can see the Overview (totals and item list, no names or screenshots)</span></label>
          {msg && <div className="ok-box">{msg}</div>}
          <button className="btn primary" onClick={saveProject}>Save</button>
        </Card>
      </Section>
      <Section title="Expense categories" right={<button className="btn ghost small-btn" onClick={addCat}>Add category</button>}>
        <Card className="list">
          {s.categories.map((c) => (
            <div key={c.id} className="list-row">
              <span className="grow"><b className="cat-letter">{c.letter}</b> {c.name}</span>
              <button className="btn ghost small-btn" onClick={() => renameCat(c.id, c.name)}>Rename</button>
              <button className="btn danger-ghost small-btn" onClick={() => delCat(c.id, c.name)}>Delete</button>
            </div>
          ))}
        </Card>
      </Section>
      <Section title="Team">
        <Card className="list">
          <p className="small muted">Everyone listed and active can log in and edit. To add a person: Supabase › Authentication › Users › Add user (email username@{s.loginDomain}, tick Auto Confirm), then activate them here.</p>
          {team.map((u) => (
            <div key={u.id} className={`list-row ${u.active ? '' : 'muted'}`}>
              <span className="grow"><span className="block"><b>{u.full_name || u.username}</b> <span className="small muted">@{u.username}</span></span></span>
              {!u.active && <Badge tone="gray">Inactive</Badge>}
              {s.admin && <><button className="btn ghost small-btn" onClick={() => editMember(u)}>Name</button>
                {u.id !== s.profile?.id && <button className="btn ghost small-btn" onClick={() => toggleMember(u)}>{u.active ? 'Deactivate' : 'Activate'}</button>}</>}
            </div>
          ))}
        </Card>
      </Section>
    </div>
  )
}
