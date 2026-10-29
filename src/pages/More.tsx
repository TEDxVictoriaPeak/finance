import React from 'react'
import { useApp } from '../lib/app'
import { Card } from '../components/ui'

export default function More() {
  const app = useApp()
  const links: [string, string, string, boolean][] = [
    ['#/add/income', 'Add income', 'Report money received', true],
    ['#/budget', 'Budget', 'Budget vs actual per division', app.staff],
    ['#/sponsors', 'Sponsors', 'Sponsorship tracker', app.staff],
    ['#/reports', 'Reports', 'Statements, ledger, exports', app.staff],
    ['#/finance', 'Finance tools', 'Transfers, reconciliation, month close', app.finance || app.organizer],
    ['#/settings', 'Settings', 'Divisions, categories, users', app.staff],
    ['#/activity', 'Activity log', 'Every change, who and when', app.staff],
    ['#/account', 'My account', 'Change password, log out', app.staff],
    ['#/login/organizer', 'Organizer Login', 'For the event Organizer', !app.staff],
    ['#/login/lead', 'Project Lead Login', 'For Project Leads and the finance team', !app.staff],
  ]
  return (
    <div className="stack narrow">
      <h1 className="page-title">More</h1>
      <Card className="list">
        {links.filter((l) => l[3]).map(([href, t, sub]) => (
          <a key={href} href={href} className="list-row link-row">
            <span className="grow"><span className="block"><b>{t}</b></span><span className="small muted">{sub}</span></span>
            <span aria-hidden="true">›</span>
          </a>
        ))}
      </Card>
      {app.staff && <button className="btn ghost" onClick={app.signOut}>Log out</button>}
    </div>
  )
}
