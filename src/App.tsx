import React, { useEffect, useState } from 'react'
import { AppProvider, useApp } from './lib/app'
import { configured, sb } from './lib/supabase'
import { DialogProvider, Loading } from './components/ui'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Submit from './pages/Submit'
import Login from './pages/Login'
import Approvals from './pages/Approvals'
import Budget from './pages/Budget'
import Sponsors from './pages/Sponsors'
import Reports from './pages/Reports'
import Finance from './pages/Finance'
import Settings from './pages/Settings'
import Activity from './pages/Activity'
import Account from './pages/Account'
import More from './pages/More'

export function useRoute() {
  const get = () => (location.hash.replace(/^#/, '') || '/').split('?')[0]
  const [route, setRoute] = useState(get())
  useEffect(() => {
    const on = () => { setRoute(get()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

const Icon = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  plus: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></>,
  login: <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />,
  more: <path d="M4 7h16M4 12h16M4 17h16" />,
  budget: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  sponsor: <path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z" />,
  report: <><path d="M6 3h9l4 4v14H6z" /><path d="M9 13h6M9 17h6M9 9h3" /></>,
  bank: <path d="M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18" />,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></>,
  log: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
}
const Svg = ({ k }: { k: keyof typeof Icon }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{Icon[k]}</svg>
)

function Shell() {
  const app = useApp()
  const route = useRoute()
  const [pending, setPending] = useState(0)

  useEffect(() => {
    if (!app.staff) { setPending(0); return }
    sb.rpc('my_queue').then(({ data }) => setPending((data as any[])?.length || 0))
  }, [app.staff, route])

  if (!configured) {
    return (
      <div className="setup-msg">
        <h1>Almost there</h1>
        <p>This site is not connected to its database yet. Add the <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> secrets in GitHub, then run the deploy again (see the setup guide, step 4).</p>
      </div>
    )
  }
  if (!app.ready) return <Loading />

  const page = (() => {
    if (route === '/' || route === '/dashboard') return <Dashboard />
    if (route === '/transactions') return <Transactions />
    if (route === '/add' || route === '/add/expense') return <Submit kind="expense" />
    if (route === '/add/income') return <Submit kind="income" />
    if (route === '/login/organizer') return <Login kind="organizer" />
    if (route === '/login/lead') return <Login kind="project_lead" />
    if (route === '/approvals') return <Approvals />
    if (route === '/budget') return <Budget />
    if (route === '/sponsors') return <Sponsors />
    if (route === '/reports') return <Reports />
    if (route === '/finance') return <Finance />
    if (route === '/settings') return <Settings />
    if (route === '/activity') return <Activity />
    if (route === '/account') return <Account />
    if (route === '/more') return <More />
    return <Dashboard />
  })()

  const is = (p: string) => (p === '/' ? route === '/' || route === '/dashboard' : route.startsWith(p))
  const side: [string, string, keyof typeof Icon, boolean][] = [
    ['/', 'Dashboard', 'home', true],
    ['/transactions', 'Transactions', 'list', true],
    ['/add/expense', 'Submit expense', 'plus', true],
    ['/add/income', 'Add income', 'plus', true],
    ['/approvals', `Approvals${pending ? ` (${pending})` : ''}`, 'check', app.staff],
    ['/budget', 'Budget', 'budget', app.staff],
    ['/sponsors', 'Sponsors', 'sponsor', app.staff],
    ['/reports', 'Reports', 'report', app.staff],
    ['/finance', 'Finance tools', 'bank', app.finance || app.organizer],
    ['/settings', 'Settings', 'gear', app.staff],
    ['/activity', 'Activity log', 'log', app.staff],
    ['/login/organizer', 'Organizer Login', 'login', !app.staff],
    ['/login/lead', 'Project Lead Login', 'login', !app.staff],
  ]

  return (
    <div className="app">
      <header className="topbar">
        <a href="#/" className="brand">
          <span className="brand-name"><b>TEDx</b>VictoriaPeak</span>
          <span className="brand-sub">Finance</span>
        </a>
        {app.staff ? (
          <a href="#/account" className="user-chip" title={app.roleLabel(app.profile)}>
            <span className="avatar" aria-hidden="true">{(app.profile!.full_name || app.profile!.username).slice(0, 1).toUpperCase()}</span>
            <span className="user-name">{app.profile!.full_name || app.profile!.username}</span>
          </a>
        ) : (
          <a href="#/more" className="login-link">Log in</a>
        )}
      </header>
      <div className="layout">
        <nav className="sidebar" aria-label="Main">
          {side.filter((s) => s[3]).map(([href, label, icon]) => (
            <a key={href} href={'#' + href} className={is(href) ? 'active' : ''}><Svg k={icon} />{label}</a>
          ))}
          {app.staff && <button className="side-out" onClick={app.signOut}>Log out</button>}
        </nav>
        <main className="main">{page}</main>
      </div>
      <nav className="tabbar" aria-label="Main">
        <a href="#/" className={is('/') ? 'active' : ''}><Svg k="home" /><span>Dashboard</span></a>
        <a href="#/transactions" className={is('/transactions') ? 'active' : ''}><Svg k="list" /><span>Transactions</span></a>
        <a href="#/add/expense" className={`tab-add ${is('/add') ? 'active' : ''}`}><Svg k="plus" /><span>Add</span></a>
        {app.staff ? (
          <a href="#/approvals" className={is('/approvals') ? 'active' : ''}>
            <Svg k="check" /><span>Approvals</span>{pending > 0 && <i className="dot">{pending}</i>}
          </a>
        ) : (
          <a href="#/login/lead" className={is('/login') ? 'active' : ''}><Svg k="login" /><span>Log in</span></a>
        )}
        <a href="#/more" className={is('/more') ? 'active' : ''}><Svg k="more" /><span>More</span></a>
      </nav>
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <DialogProvider>
        <Shell />
      </DialogProvider>
    </AppProvider>
  )
}
