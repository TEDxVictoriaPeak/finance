import React, { useState } from 'react'
import { useApp } from '../lib/app'
import { Card } from '../components/ui'
import EntryForm from '../components/EntryForm'

export default function Submit({ kind }: { kind: 'expense' | 'income' }) {
  const app = useApp()
  const [done, setDone] = useState<string | null>(null)
  const [n, setN] = useState(0)

  if (done) {
    return (
      <Card className="hero">
        <h1>Submitted</h1>
        <p>Your reference is <b>{done}</b>. {kind === 'expense'
          ? 'It now goes to the Project Lead and the Head of Finance for approval. It only counts in the balance once approved.'
          : 'The finance team will check it against the bank and then post it to the balance.'}</p>
        <div className="row gap wrap">
          <button className="btn primary" onClick={() => { setDone(null); setN(n + 1) }}>Submit another</button>
          <a className="btn ghost" href="#/">Back to dashboard</a>
        </div>
      </Card>
    )
  }

  return (
    <div className="stack narrow">
      <div className="seg" role="tablist">
        <a href="#/add/expense" role="tab" aria-selected={kind === 'expense'} className={kind === 'expense' ? 'on' : ''}>Submit expense</a>
        <a href="#/add/income" role="tab" aria-selected={kind === 'income'} className={kind === 'income' ? 'on' : ''}>Add income</a>
      </div>
      <Card>
        <p className="info">
          {kind === 'expense'
            ? `Expenses go to the division's Project Lead, then the Head of Finance${app.settings ? ` (amounts above ${(app.settings.organizer_signoff_above / 100).toLocaleString('en-HK')} HKD also need the Organizer)` : ''}. They only count toward the balance once approved.`
            : 'Income is checked by the finance team against the bank before it counts toward the balance.'}
        </p>
        <EntryForm key={kind + n} kind={kind} onDone={(ref) => setDone(ref || '')} />
      </Card>
    </div>
  )
}
