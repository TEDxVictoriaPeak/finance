import React, { useEffect, useState } from 'react'
import { sb, errText } from '../lib/supabase'
import { useApp } from '../lib/app'
import { fmtDateTime, today } from '../lib/format'
import { buildPack } from '../lib/pack.js'
import { writeXlsx } from '../lib/xlsx.js'
import { Card, ErrorBox, useDialog } from './ui'

const TABS = ['Cover & sign-off', 'Income & Expenditure', 'Financial Position', 'Cash Flow', 'Budget vs Actual', 'Trial Balance',
  'Payables Aging', 'Sponsors', 'Transactions', 'Journal', 'Chart of Accounts', 'Budget', 'Bank Reconciliation']

export default function ReportPack() {
  const app = useApp()
  const dlg = useDialog()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [keyInfo, setKeyInfo] = useState<{ exists: boolean; created_at: string | null } | null>(null)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [copied, setCopied] = useState('')

  useEffect(() => { sb.rpc('export_key_info').then(({ data }) => setKeyInfo(data as any)) }, [newKey])

  const download = async () => {
    setBusy(true); setErr(null)
    try {
      const { data, error } = await sb.rpc('report_data')
      if (error) throw error
      const bytes = writeXlsx(buildPack(data))
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      a.download = `TEDxVictoriaPeak-Financial-Report-Pack-${today()}.xlsx`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    } catch (x) { setErr(errText(x)) }
    setBusy(false)
  }

  const createKey = async () => {
    if (keyInfo?.exists) {
      const ok = await dlg.ask({ title: 'Replace Google Sheets key?', message: 'The old key stops working, so the Google Sheet needs the new key (TEDx Finance › Set up connection).', input: false, confirmText: 'Create new key' })
      if (!ok) return
    }
    const { data, error } = await sb.rpc('create_export_key')
    if (error) setErr(errText(error)); else setNewKey(data as string)
  }
  const revoke = async () => {
    const ok = await dlg.ask({ title: 'Turn off Google Sheets sync?', message: 'The Google Sheet will stop updating until you create a new key.', input: false, confirmText: 'Turn off', danger: true })
    if (!ok) return
    const { error } = await sb.rpc('revoke_export_keys')
    if (error) setErr(errText(error)); else { setNewKey(null); setKeyInfo({ exists: false, created_at: null }) }
  }
  const copy = async (label: string, v: string) => { try { await navigator.clipboard.writeText(v); setCopied(label); setTimeout(() => setCopied(''), 1500) } catch { /* ignore */ } }

  const url = import.meta.env.VITE_SUPABASE_URL as string
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string

  return (
    <Card className="stack no-print">
      <div>
        <h2 className="report-title">Financial Report Pack</h2>
        <p className="muted small">One workbook with {TABS.length} tabs: {TABS.join(', ')}. Every report is a live formula over the Journal, so changing the period on the Cover tab recalculates everything. Opens in Google Sheets or Excel.</p>
      </div>
      <button className="btn primary" disabled={busy} onClick={download}>{busy ? 'Preparing…' : 'Download report pack (.xlsx)'}</button>
      <p className="small muted">To open in Google Sheets: upload the file to Google Drive, then right-click › Open with › Google Sheets (or in Sheets: File › Import › Upload).</p>
      <ErrorBox msg={err} />

      {app.finAdmin && (
        <div className="pay-box stack">
          <h4 className="small-head">Google Sheets auto-sync</h4>
          <p className="small">A Google Sheet that refreshes itself every morning from the portal. Set-up steps are in the setup guide, part 7.</p>
          {keyInfo?.exists && !newKey && <p className="small muted">A key is active (created {fmtDateTime(keyInfo.created_at)}).</p>}
          {newKey && (
            <div className="stack tight">
              <div className="ok-box small">Copy this key now. It is shown only once.</div>
              <code className="key-box">{newKey}</code>
              <div className="row gap wrap">
                <button className="btn ghost small-btn" onClick={() => copy('key', newKey)}>{copied === 'key' ? 'Copied' : 'Copy key'}</button>
                <button className="btn ghost small-btn" onClick={() => copy('url', url)}>{copied === 'url' ? 'Copied' : 'Copy Supabase URL'}</button>
                <button className="btn ghost small-btn" onClick={() => copy('anon', anon)}>{copied === 'anon' ? 'Copied' : 'Copy anon key'}</button>
              </div>
            </div>
          )}
          <div className="row gap wrap">
            <button className="btn ghost small-btn" onClick={createKey}>{keyInfo?.exists ? 'Create new key' : 'Create key'}</button>
            {keyInfo?.exists && <button className="btn danger-ghost small-btn" onClick={revoke}>Turn off sync</button>}
          </div>
        </div>
      )}
    </Card>
  )
}
