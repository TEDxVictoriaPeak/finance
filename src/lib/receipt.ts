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

let notSetUp = false
/** True once we know the reader is not installed yet, so we stop trying in this visit */
export const readerOff = () => notSetUp

export async function readReceipt(file: File, categories: string): Promise<{ result?: Scan; error?: string; off?: boolean }> {
  if (notSetUp) return { off: true }
  const f = file.type === 'application/pdf' ? file : await shrinkPhoto(file)
  if (f.size > 10_000_000) return { error: 'This file is too big to read automatically. Please fill in by hand.' }
  const data = await toBase64(f)
  const { data: res, error } = await sb.functions.invoke('scan-receipt', { body: { mime: f.type, data, categories } })
  if (error) {
    const ctx: any = (error as any).context
    const status = ctx?.status
    let msg = ''
    try { msg = (await ctx?.json?.())?.error || '' } catch { /* not json */ }
    if (status === 404 || /not found|failed to send|fetch/i.test(msg || error.message)) { notSetUp = true; return { off: true } }
    if (/not set up yet/i.test(msg)) { notSetUp = true; return { off: true, error: msg } }
    return { error: msg || 'Could not read this receipt. Please fill in by hand.' }
  }
  if (!res?.result) return { error: res?.error || 'Could not read this receipt. Please fill in by hand.' }
  return { result: res.result as Scan }
}

export const CURRENCIES = ['USD', 'CNY', 'EUR', 'GBP', 'JPY', 'SGD', 'TWD', 'MYR', 'IDR', 'KRW', 'AUD', 'CAD', 'THB']
