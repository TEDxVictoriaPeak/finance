import React, { useEffect, useState } from 'react'
import { StoreProvider, useStore } from './lib/store'
import { configured } from './lib/supabase'
import { DialogProvider, Loading } from './components/ui'
import Overview from './pages/Overview'
import Expenses from './pages/Expenses'
import ItemForm from './pages/ItemForm'
import ItemView from './pages/ItemView'
import PrintAll from './pages/PrintAll'
import Report from './pages/Report'
import FundingPage from './pages/Funding'
import Settings from './pages/Settings'
import Login from './pages/Login'
import More from './pages/More'

function useRoute() {
  const get = () => (location.hash.replace(/^#/, '') || '/').split('?')[0]
  const [r, setR] = useState(get())
  useEffect(() => {
    const on = () => { setR(get()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return r
}

const I = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  plus: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>,
  report: <><path d="M6 3h9l4 4v14H6z" /><path d="M9 13h6M9 17h6M9 9h3" /></>,
  money: <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></>,
  print: <><path d="M7 9V3h10v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M7 14h10v7H7z" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>,
  login: <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />,
  more: <path d="M4 7h16M4 12h16M4 17h16" />,
}
const Svg = ({ k }: { k: keyof typeof I }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{I[k]}</svg>
)

function Shell() {
  const s = useStore()
  const route = useRoute()
  if (!configured) return <div className="setup-msg"><h1>Almost there</h1><p>Add the Supabase secrets in GitHub and run the deploy again.</p></div>
  if (!s.ready) return <Loading />

  const m = route.match(/^\/item\/([0-9a-f-]{36})(\/edit)?$/)
  const page = (() => {
    if (route === '/' ) return <Overview />
    if (route === '/expenses') return s.staff ? <Expenses /> : <Overview />
    if (route === '/add') return s.staff ? <ItemForm /> : <Login />
    if (m) return s.staff ? (m[2] ? <ItemForm id={m[1]} /> : <ItemView id={m[1]} />) : <Login />
    if (route === '/print') return s.staff ? <PrintAll /> : <Login />
    if (route === '/report') return s.staff ? <Report /> : <Login />
    if (route === '/funding' || route === '/income') return s.staff ? <FundingPage /> : <Login />
    if (route === '/settings') return s.staff ? <Settings /> : <Login />
    if (route === '/login') return <Login />
    if (route === '/more') return <More />
    return <Overview />
  })()

  const is = (p: string) => (p === '/' ? route === '/' : route.startsWith(p) || (p === '/expenses' && route.startsWith('/item')))
  const side: [string, string, keyof typeof I, boolean][] = [
    ['/', 'Overview', 'home', true],
    ['/expenses', 'Expenses', 'list', s.staff],
    ['/add', 'Add expense', 'plus', s.staff],
    ['/report', 'Report', 'report', s.staff],
    ['/income', 'Income', 'money', s.staff],
    ['/print', 'Print item sheets', 'print', s.staff],
    ['/settings', 'Settings', 'gear', s.staff],
    ['/login', 'Log in', 'login', !s.staff],
  ]

  return (
    <div className="app">
      <header className="topbar no-print">
        <a href="#/" className="brand"><span className="brand-name"><b>TEDx</b>VictoriaPeak</span><span className="brand-sub">Finance</span></a>
        {s.staff ? (
          <a href="#/more" className="user-chip"><span className="avatar" aria-hidden="true">{(s.profile!.full_name || s.profile!.username).slice(0, 1).toUpperCase()}</span><span className="user-name">{s.profile!.full_name || s.profile!.username}</span></a>
        ) : <a href="#/login" className="login-link">Log in</a>}
      </header>
      <div className="layout">
        <nav className="sidebar no-print" aria-label="Main">
          {side.filter((x) => x[3]).map(([h, l, ic]) => <a key={h} href={'#' + h} className={is(h) ? 'active' : ''}><Svg k={ic} />{l}</a>)}
          {s.staff && <button className="side-out" onClick={s.signOut}>Log out</button>}
        </nav>
        <main className="main">{page}</main>
      </div>
      <nav className="tabbar no-print" aria-label="Main">
        <a href="#/" className={is('/') ? 'active' : ''}><Svg k="home" /><span>Overview</span></a>
        {s.staff ? <>
          <a href="#/expenses" className={is('/expenses') ? 'active' : ''}><Svg k="list" /><span>Expenses</span></a>
          <a href="#/add" className={`tab-add ${is('/add') ? 'active' : ''}`}><Svg k="plus" /><span>Add</span></a>
          <a href="#/report" className={is('/report') ? 'active' : ''}><Svg k="report" /><span>Report</span></a>
          <a href="#/more" className={is('/more') ? 'active' : ''}><Svg k="more" /><span>More</span></a>
        </> : <a href="#/login" className={is('/login') ? 'active' : ''}><Svg k="login" /><span>Log in</span></a>}
      </nav>
    </div>
  )
}

export default function App() {
  return <StoreProvider><DialogProvider><Shell /></DialogProvider></StoreProvider>
}
