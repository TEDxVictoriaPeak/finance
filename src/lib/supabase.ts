import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const configured = Boolean(url && key)

export const sb = createClient(url || 'https://not-configured.supabase.co', key || 'not-configured', {
  auth: { persistSession: true, autoRefreshToken: true },
})

/** Turns a Supabase error into a short message for people. */
export function errText(e: any): string {
  const m: string = e?.message || e?.error_description || String(e || 'Something went wrong')
  if (m.includes('Invalid login credentials')) return 'Wrong username or password.'
  if (m.includes('Failed to fetch')) return 'No connection. Check your internet and try again.'
  return m.replace(/^OVER_BUDGET:\s*/, 'Over budget: ')
}
