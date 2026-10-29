import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { sb } from './supabase'
import { fyOf, today } from './format'

export type Profile = {
  id: string; username: string; full_name: string; role: 'organizer' | 'project_lead'
  is_finance_admin: boolean; is_finance_officer: boolean; division_id: string | null; active: boolean
}
export type Settings = {
  org_name: string; currency: string; fy_start_month: number; single_approval_max: number
  organizer_signoff_above: number; receipt_required_above: number; public_dashboard: boolean
  event_date: string | null; sponsorship_target: number; login_domain: string
}
export type Division = { id: string; name: string; sort: number; archived: boolean }
export type Category = { id: string; name: string; kind: 'expense' | 'income'; account_id: string; sort: number; archived: boolean }
export type Account = { id: string; code: string; name: string; type: string; is_cash: boolean; system_key: string | null; archived: boolean }
export type Sponsor = {
  id: string; name: string; tier: string; in_kind: boolean; committed: number; status: string
  pic: string | null; benefits_owed: string | null; benefits_delivered: string | null; notes: string | null
}

type Ctx = {
  ready: boolean
  profile: Profile | null
  settings: Settings | null
  divisions: Division[]
  categories: Category[]
  accounts: Account[]
  sponsors: Sponsor[]
  staff: boolean
  finAdmin: boolean
  finance: boolean
  organizer: boolean
  currentFy: number
  reload: () => Promise<void>
  signOut: () => Promise<void>
  nameOf: { division: (id?: string | null) => string; category: (id?: string | null) => string; account: (id?: string | null) => string; sponsor: (id?: string | null) => string }
  roleLabel: (p?: Profile | null) => string
}

const AppCtx = createContext<Ctx>(null as any)
export const useApp = () => useContext(AppCtx)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [divisions, setDivisions] = useState<Division[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [sponsors, setSponsors] = useState<Sponsor[]>([])

  const reload = useCallback(async () => {
    const { data: sess } = await sb.auth.getSession()
    let prof: Profile | null = null
    if (sess.session) {
      const { data } = await sb.from('profiles').select('*').eq('id', sess.session.user.id).maybeSingle()
      prof = data && data.active ? (data as Profile) : null
    }
    const [s, d, c, a] = await Promise.all([
      sb.from('settings').select('*').eq('id', 1).maybeSingle(),
      sb.from('divisions').select('*').order('sort').order('name'),
      sb.from('categories').select('*').order('kind').order('sort').order('name'),
      sb.from('accounts').select('*').order('code'),
    ])
    setProfile(prof)
    setSettings((s.data as Settings) || null)
    setDivisions((d.data as Division[]) || [])
    setCategories((c.data as Category[]) || [])
    setAccounts((a.data as Account[]) || [])
    if (prof) {
      const { data } = await sb.from('sponsors').select('*').order('name')
      setSponsors((data as Sponsor[]) || [])
    } else setSponsors([])
    setReady(true)
  }, [])

  useEffect(() => {
    reload()
    const { data } = sb.auth.onAuthStateChange((evt) => {
      if (evt === 'SIGNED_IN' || evt === 'SIGNED_OUT') reload()
    })
    return () => data.subscription.unsubscribe()
  }, [reload])

  const signOut = async () => {
    await sb.auth.signOut()
    await reload()
    location.hash = '#/'
  }

  const staff = !!profile
  const finAdmin = !!profile?.is_finance_admin
  const finance = finAdmin || !!profile?.is_finance_officer
  const organizer = profile?.role === 'organizer'
  const currentFy = fyOf(today(), settings?.fy_start_month || 7)

  const find = <T extends { id: string; name: string }>(list: T[]) => (id?: string | null) =>
    (id && list.find((x) => x.id === id)?.name) || '—'

  const roleLabel = (p?: Profile | null) => {
    if (!p) return 'Viewer'
    const parts = [p.role === 'organizer' ? 'Organizer' : 'Project Lead']
    if (p.is_finance_admin) parts.push('Head of Finance')
    if (p.is_finance_officer) parts.push('Finance Officer')
    return parts.join(' · ')
  }

  return (
    <AppCtx.Provider
      value={{
        ready, profile, settings, divisions, categories, accounts, sponsors,
        staff, finAdmin, finance, organizer, currentFy, reload, signOut, roleLabel,
        nameOf: { division: find(divisions), category: find(categories), account: find(accounts), sponsor: find(sponsors) },
      }}
    >
      {children}
    </AppCtx.Provider>
  )
}
