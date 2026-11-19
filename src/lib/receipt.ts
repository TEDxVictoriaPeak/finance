import { sb } from './supabase'
import { shrinkPhoto } from './format'

/** What the receipt reader suggests. Always checked by a person before saving. */
export type Scan = {
  is_receipt: boolean
  is_proof_of_payment: boolean
  supplier: string
  description: string
  purchased_item: string
  total_paid: number | null
  currency: string
  purchase_date: string
  payment_method: string
  category_letter: string
  confidence: 'high' | 'medium' | 'low'
  notes: string
}

export const canRead = (f: File) => /^image\/(jpeg|png|webp|heic|heif)$/.test(f.type) || f.type === 'application/pdf'

const toBase64 = (f: Blob) =>
  new Promise<string>((ok, bad) => {
    const r = new FileReader()
    r.onload = () => ok(String(r.result).split(',')[1] || '')
    r.onerror = () => bad(r.error)
    r.readAsDataURL(f)
  })

/** Kept for compatibility: the reader is never switched off silently any more */
export const readerOff = () => false

const SETUP_HINT = 'In Supabase › Edge Functions, check that a function named exactly scan-receipt is deployed, and turn off "Verify JWT" for it (the reader checks the login itself).'

export async function readReceipt(file: File, categories: string): Promise<{ result?: Scan; error?: string; off?: boolean }> {
  const f = file.type === 'application/pdf' ? file : await shrinkPhoto(file)
  if (f.size > 10_000_000) return { error: 'This file is too big to read automatically. Please fill in by hand.' }
  const data = await toBase64(f)
  let res: any, error: any
  try { ({ data: res, error } = await sb.functions.invoke('scan-receipt', { body: { mime: f.type, data, categories } })) }
  catch (e) { error = e }
  if (error) {
    const ctx: any = error.context
    const status: number | undefined = typeof ctx?.status === 'number' ? ctx.status : undefined
    let msg = ''
    try { const j = await ctx?.json?.(); msg = j?.error || j?.message || j?.msg || '' } catch { /* not json */ }
    if (status === 404) return { error: `Receipt reader not found (404). ${SETUP_HINT}` }
    if (status === 401) return { error: `Receipt reader refused the login (401${msg ? `: ${msg}` : ''}). ${SETUP_HINT}` }
    if (!status) return { error: `Could not reach the receipt reader (${error.message || 'network error'}). ${SETUP_HINT}` }
    return { error: msg ? `${msg} (error ${status})` : `Receipt reader error ${status}. Please fill in by hand, or send a screenshot of this message.` }
  }
  if (!res?.result) return { error: res?.error || 'Could not read this receipt. Please fill in by hand.' }
  return { result: res.result as Scan }
}

export const CURRENCIES = ['USD', 'CNY', 'EUR', 'GBP', 'JPY', 'SGD', 'TWD', 'MYR', 'IDR', 'KRW', 'AUD', 'CAD', 'THB']
