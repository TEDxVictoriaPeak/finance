import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { sb } from './supabase'

export type Profile = { id: string; username: string; full_name: string; role: string; is_finance_admin: boolean; active: boolean }
export type Project = { project_name: string; club_name: string; currency: string; public_view: boolean }
export type Category = { id: string; letter: string; name: string }
export type Item = {
  id: string; category_id: string; seq: number; description: string; submitted_by: string | null; submitted_on: string | null
  purpose: string | null; purchased_item: string | null; supplier: string | null; purchase_dates: string[]; amount: number
  remarks: string | null; proof_paths: string[]; created_at: string; created_by_name: string | null; updated_at: string; updated_by_name: string | null
}
export type Funding = { id: string; source: string; kind: string; amount: number; received_on: string | null; note: string | null; status?: 'promised' | 'received' }

type Ctx = {
  ready: boolean; profile: Profile | null; staff: boolean; admin: boolean
  project: Project | null; categories: Category[]; loginDomain: string
  reload: () => Promise<void>; signOut: () => Promise<void>
  catOf: (id: string) => Category | undefined
  code: (it: { category_id: string; seq: number }) => string
}
const C = createContext<Ctx>(null as any)
export const useStore = () => useContext(C)

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [loginDomain, setLoginDomain] = useState('finance.tedxvictoriapeak.com')

  const reload = useCallback(async () => {
    const { data: s } = await sb.auth.getSession()
    let prof: Profile | null = null
    if (s.session) {
      const { data } = await sb.from('profiles').select('*').eq('id', s.session.user.id).maybeSingle()
      prof = data && data.active ? (data as Profile) : null
    }
    const [p, c, st] = await Promise.all([
      sb.from('project').select('*').eq('id', 1).maybeSingle(),
      sb.from('exp_categories').select('*').order('letter'),
      sb.from('settings').select('login_domain').eq('id', 1).maybeSingle(),
    ])
    setProfile(prof)
    setProject((p.data as Project) || null)
    setCategories(((c.data as Category[]) || []).sort((a, b) => a.letter.length - b.letter.length || a.letter.localeCompare(b.letter)))
    if (st.data?.login_domain) setLoginDomain(st.data.login_domain)
    setReady(true)
  }, [])

  useEffect(() => {
    reload()
    const { data } = sb.auth.onAuthStateChange((e) => { if (e === 'SIGNED_IN' || e === 'SIGNED_OUT') reload() })
    return () => data.subscription.unsubscribe()
  }, [reload])

  const signOut = async () => { await sb.auth.signOut(); await reload(); location.hash = '#/' }
  const catOf = (id: string) => categories.find((c) => c.id === id)
  const code = (it: { category_id: string; seq: number }) => (catOf(it.category_id)?.letter || '?') + it.seq

  return (
    <C.Provider value={{ ready, profile, staff: !!profile, admin: !!profile?.is_finance_admin, project, categories, loginDomain, reload, signOut, catOf, code }}>
      {children}
    </C.Provider>
  )
}

/** HK$ amount with 2 decimals, amounts are plain dollars (numeric) */
export const hk = (n: number | string | null | undefined) =>
  'HK$' + Number(n || 0).toLocaleString('en-HK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const num = (n: number | string | null | undefined) =>
  Number(n || 0).toLocaleString('en-HK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** A proof can also be a Google Drive (or other) web link instead of an uploaded file */
export const isLink = (p: string) => /^https?:\/\//i.test(p)

/** Signed links for private screenshots (valid 1 hour) */
export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  paths.filter((p) => p && isLink(p)).forEach((p) => (out[p] = p))
  const list = paths.filter((p) => p && !isLink(p))
  for (let i = 0; i < list.length; i += 100) {
    const { data } = await sb.storage.from('receipts').createSignedUrls(list.slice(i, i + 100), 3600)
    ;(data || []).forEach((d: any) => { if (d.signedUrl) out[d.path] = d.signedUrl })
  }
  return out
}
