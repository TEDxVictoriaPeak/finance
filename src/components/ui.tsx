import React, { createContext, useContext, useState } from 'react'
import { STATUS } from '../lib/format'

export function Badge({ status, children, tone }: { status?: string; children?: React.ReactNode; tone?: string }) {
  const s = status ? STATUS[status] : null
  return <span className={`badge ${tone || s?.tone || 'gray'}`}>{children || s?.label || status}</span>
}

export function Card({ children, className = '', ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`card ${className}`} {...rest}>{children}</div>
}

export function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="section">
      <div className="section-head"><h2>{title}</h2>{right}</div>
      {children}
    </section>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>
}

export function Loading() {
  return <div className="loading" aria-live="polite">Loading…</div>
}

export function ErrorBox({ msg }: { msg: string | null }) {
  if (!msg) return null
  return <div className="error-box" role="alert">{msg}</div>
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export function Bar({ value, max, tone }: { value: number; max: number; tone?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  const t = tone || (max > 0 && value > max ? 'red' : pct >= 80 ? 'amber' : 'navy')
  return (
    <div className="bar" role="img" aria-label={`${Math.round(pct)}%`}>
      <div className={`bar-fill ${t}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

// ---- Promise-based dialogs (instead of window.prompt) ----
type Ask = { title: string; message?: string; label?: string; required?: boolean; confirmText?: string; danger?: boolean; input?: boolean; resolve: (v: string | null) => void }
const DialogCtx = createContext<{ ask: (o: Omit<Ask, 'resolve'>) => Promise<string | null> }>(null as any)
export const useDialog = () => useContext(DialogCtx)

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [cur, setCur] = useState<Ask | null>(null)
  const [val, setVal] = useState('')
  const ask = (o: Omit<Ask, 'resolve'>) =>
    new Promise<string | null>((resolve) => { setVal(''); setCur({ ...o, resolve }) })
  const close = (v: string | null) => { cur?.resolve(v); setCur(null) }
  return (
    <DialogCtx.Provider value={{ ask }}>
      {children}
      {cur && (
        <Modal title={cur.title} onClose={() => close(null)}>
          {cur.message && <p className="muted">{cur.message}</p>}
          {cur.input !== false && (
            <Field label={cur.label || 'Note'}>
              <textarea rows={3} value={val} onChange={(e) => setVal(e.target.value)} autoFocus />
            </Field>
          )}
          <div className="row gap end">
            <button className="btn ghost" onClick={() => close(null)}>Cancel</button>
            <button
              className={`btn ${cur.danger ? 'danger' : 'primary'}`}
              disabled={cur.input !== false && cur.required && !val.trim()}
              onClick={() => close(cur.input === false ? 'ok' : val.trim())}
            >{cur.confirmText || 'OK'}</button>
          </div>
        </Modal>
      )}
    </DialogCtx.Provider>
  )
}
