// TEDxVictoriaPeak Finance – receipt reader (Supabase Edge Function)
// Reads a receipt photo or PDF with Google Gemini (free tier) and returns
// suggested fields. The app shows them highlighted so a person checks them
// before saving. Nothing is saved here.
//
// Setup (once): Supabase › Edge Functions › Secrets: add GEMINI_API_KEY.
// Optional secret GEMINI_MODEL to try a specific model first.

// Tried in order: if one is not available or its free daily limit is used up, the next one is used.
const MODELS = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite']

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    is_receipt: { type: 'BOOLEAN', description: 'false if the image is not a receipt, invoice, order or payment screen' },
    is_proof_of_payment: { type: 'BOOLEAN', description: 'true only if it shows money was actually paid (receipt, paid order, card charge, bank/FPS transfer). false for a quotation or an unpaid invoice' },
    supplier: { type: 'STRING', description: 'shop or company that was paid, short, e.g. "Namecheap", "Daiso"' },
    description: { type: 'STRING', description: 'short line for the expense report, e.g. "Domain tedxvictoriapeak.com (1 year)"' },
    purchased_item: { type: 'STRING', description: 'what exactly was bought, e.g. "Domain registration .com, 1 year + free privacy"' },
    total_paid: { type: 'NUMBER', nullable: true, description: 'final amount actually paid, after discounts, including tax and fees. null if not visible' },
    currency: { type: 'STRING', description: 'ISO code of total_paid: HKD, USD, CNY, EUR, GBP, JPY, SGD, TWD, IDR, ... "$" alone on a Hong Kong receipt is HKD; on a US website it is USD' },
    purchase_date: { type: 'STRING', description: 'YYYY-MM-DD, or "" if not visible' },
    payment_method: { type: 'STRING', description: 'e.g. "Visa ****2004", "FPS", "Octopus", "cash", or ""' },
    category_letter: { type: 'STRING', description: 'best matching category letter from the list, or ""' },
    confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
    notes: { type: 'STRING', description: 'anything the person should check, in one short English sentence, or ""' },
  },
  required: ['is_receipt', 'is_proof_of_payment', 'supplier', 'description', 'purchased_item', 'total_paid', 'currency', 'purchase_date', 'payment_method', 'category_letter', 'confidence', 'notes'],
}

const prompt = (categories: string) => `You read receipts for the finance team of a TEDx event in Hong Kong.
Extract the fields from the attached receipt, order confirmation, card charge or bank transfer screenshot.
Rules:
- total_paid is the final amount actually paid (not a subtotal, not before discounts). If a refund is shown, use the amount after the refund and mention it in notes.
- currency must be the currency of total_paid. Never convert currencies.
- Dates: if a date like 03/04/2027 is ambiguous, read it as day/month (Hong Kong style) and mention it in notes.
- Never guess. If something is not visible, use "" (or null for total_paid) and set confidence to "low".
- If the document is a quotation, estimate or an unpaid invoice, set is_proof_of_payment to false.
- Write description and purchased_item in English, short and plain.
Expense categories (letter: name):
${categories || '(none given)'}`

const MIME = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply({ error: 'Use POST' }, 405)
  try {
    const key = Deno.env.get('GEMINI_API_KEY')
    if (!key) return reply({ error: 'Receipt reading is not set up yet: add GEMINI_API_KEY in Supabase › Edge Functions › Secrets.' }, 500)

    // Only active finance team members may use it (checked with their own login)
    const auth = req.headers.get('Authorization') || ''
    const check = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/is_staff`, {
      method: 'POST',
      headers: { Authorization: auth, apikey: req.headers.get('apikey') || Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '', 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (!check.ok || (await check.json()) !== true) return reply({ error: 'Only the finance team can read receipts. Please log in again.' }, 403)

    const { mime, data, categories } = await req.json()
    if (typeof data !== 'string' || !data || typeof mime !== 'string' || !MIME.test(mime)) return reply({ error: 'Send a photo (JPG, PNG) or a PDF.' }, 400)
    if (data.length > 14_000_000) return reply({ error: 'This file is too big to read (max about 10 MB).' }, 413)

    const body = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt(String(categories || '').slice(0, 2000)) }, { inline_data: { mime_type: mime, data } }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA },
    })
    const models = [...new Set([Deno.env.get('GEMINI_MODEL'), ...MODELS].filter(Boolean))] as string[]
    let out: any = null, model = '', lastStatus = 0, lastMsg = ''
    for (const m of models) {
      const g = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body,
      })
      const o = await g.json().catch(() => ({}))
      if (g.ok) { out = o; model = m; break }
      lastStatus = g.status; lastMsg = o?.error?.message || `AI service error ${g.status}`
      // Try the next model only if this one is missing or out of free quota
      if (!(g.status === 404 || g.status === 429 || /not found|not supported/i.test(lastMsg))) break
    }
    if (!out) {
      if (lastStatus === 429) return reply({ error: 'The free receipt reader is busy or its daily limit is reached. Try again later, or fill in by hand.' }, 429)
      return reply({ error: lastMsg }, 502)
    }
    const text = (out?.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || '').join('')
    let result
    try { result = JSON.parse(text) } catch { return reply({ error: 'Could not read this receipt. Please fill in by hand.' }, 502) }
    return reply({ result, model })
  } catch (e) {
    return reply({ error: String((e as Error)?.message || e) }, 500)
  }
})
