import React, { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { OpsApi } from '../api'
import { subscribeAudit } from '../api/auditStream'

const A = 'ADMIN', M = 'MODERATOR', S = 'SUPPORT', AN = 'ANALYST'

// Role → visible sections matrix (frontend guide §1.2 / §7). Hide, don't disable.
// Labels are deliberately very easy English — this dashboard teaches its users.
const NAV = [
  { group: 'Start' },
  { to: '/', label: 'Home', roles: [A, M, S, AN], end: true },
  { group: 'People' },
  { to: '/users', label: 'All users', roles: [A, M, S] },
  { to: '/users/new', label: 'Add users', roles: [A] },
  { to: '/users/analytics', label: 'User growth', roles: [A, M, S, AN] },
  { group: 'Check content' },
  // Two queues, deliberately not merged: this one triages reports about live content, the review
  // queue below releases or buries content nobody but its author has seen.
  { to: '/moderation', label: 'Reported content', roles: [A, M], end: true },
  { to: '/moderation/review', label: 'New posts to check (AI)', roles: [A, M] },
  { to: '/moderation/content', label: 'Find & remove content', roles: [A, M] },
  { to: '/moderation/blocklist', label: 'Blocked words', roles: [A, M] },
  { to: '/moderation/sounds', label: 'Sounds & music', roles: [A, M] },
  { group: 'AI helper' },
  { to: '/moderation/health', label: 'AI health check', roles: [A, M, AN] },
  { to: '/moderation/settings', label: 'AI rules', roles: [A, M] },
  { to: '/moderation/dataset', label: 'Teach the AI', roles: [A, M] },
  { to: '/moderation/model', label: 'AI versions', roles: [A, AN] },
  { group: 'Keep people safe' },
  { to: '/safety', label: 'User reports', roles: [A, M, S], end: true },
  { to: '/safety/strikes', label: 'Warnings (strikes)', roles: [A, M] },
  { to: '/safety/record', label: "One user's record", roles: [A, M] },
  { to: '/safety/analytics', label: 'Safety numbers', roles: [A, M] },
  { group: 'Library' },
  { to: '/research', label: 'Research papers', roles: [A, M] },
  { to: '/qna', label: 'Questions & answers', roles: [A, M] },
  { to: '/tags', label: 'Tags & trending', roles: [A] },
  { to: '/knowledge', label: 'Topic names', roles: [A] },
  { group: 'Chat & live' },
  { to: '/chat', label: 'Chat overview', roles: [A, M], end: true },
  { to: '/chat/channels', label: 'Channels', roles: [A, M] },
  { to: '/chat/streams', label: 'Live streams', roles: [A, M] },
  { to: '/chat/legal-holds', label: 'Legal holds', roles: [A] },
  { group: 'Photos & videos' },
  { to: '/media', label: 'Uploads', roles: [A], end: true },
  { to: '/media/storage', label: 'Storage space', roles: [A] },
  { group: 'Messages to users' },
  { to: '/notifications', label: 'Notifications', roles: [A, S, AN], end: true },
  { to: '/notifications/announcements', label: 'Announcements', roles: [A] },
  { to: '/notifications/email', label: 'Email status', roles: [A] },
  { group: 'Search & feed' },
  { to: '/search', label: 'Search tools', roles: [A, AN] },
  { to: '/feed', label: 'Feed settings', roles: [A, AN], end: true },
  { to: '/feed/suggestions', label: 'Friend suggestions', roles: [A, AN] },
  { group: 'Records' },
  { to: '/logs', label: 'System records', roles: [A, M, S, AN], end: true },
  { to: '/logs/audit', label: 'Admin action history', roles: [A, M, S, AN] },
  { to: '/analytics', label: 'Numbers & charts', roles: [A, AN] },
  { group: 'System' },
  { to: '/ops', label: 'System health', roles: [A] },
  { to: '/activity', label: 'Emergency access', roles: [A] },
  { to: '/discovery', label: 'Privacy tools', roles: [A] },
]

function pageTitleFor(pathname) {
  if (pathname === '/') return 'Home'
  // Deeper than any nav entry, so the longest-prefix match below would mistitle it.
  if (/^\/moderation\/review\/[^/]+$/.test(pathname)) return 'Check this post'
  let best = null
  for (const n of NAV) {
    if (n.group || n.to === '/') continue
    if (pathname === n.to || pathname.startsWith(n.to + '/')) {
      if (!best || n.to.length > best.to.length) best = n
    }
  }
  if (best) return best.label
  if (pathname.startsWith('/users/')) return 'One user'
  if (pathname.startsWith('/safety/reports/')) return 'One report'
  return 'Admin'
}

function HealthChips() {
  const { user } = useAuth()
  const [health, setHealth] = useState(null)
  useEffect(() => {
    if (user?.role !== 'ADMIN') return
    let stop = false
    const load = async () => {
      try { const h = await OpsApi.health(); if (!stop) setHealth(h) } catch { if (!stop) setHealth(null) }
    }
    load()
    const t = setInterval(load, 60_000)
    return () => { stop = true; clearInterval(t) }
  }, [user])
  if (!health) return null
  return (
    <div className="chips">
      {Object.entries(health).map(([dep, v]) => {
        const st = v?.status || 'UNKNOWN'
        const cls = st === 'UP' ? 'up' : (st === 'DOWN' ? 'down' : 'warn')
        return <span key={dep} className={`chip ${cls}`} title={`${dep}: ${st}${v?.latencyMs != null ? ` ${v.latencyMs}ms` : ''}${v?.error ? ` — ${v.error}` : ''}`}>{dep}</span>
      })}
    </div>
  )
}

function AuditTicker() {
  const [state, setState] = useState({ rows: [], status: 'idle' })
  useEffect(() => subscribeAudit(setState), [])
  const last = state.rows[0]
  return (
    <div className="ticker" title="Live audit stream (GET /api/v1/admin/audit/stream) — every admin action shows here as it happens">
      <span className={`badge ${state.status === 'open' ? 'green' : state.status === 'error' ? 'err' : 'gray'}`}>
        {state.status === 'open' ? 'live feed on' : state.status === 'error' ? 'live feed error' : 'live feed off'}
      </span>
      {/* The changing key remounts the span per event, replaying its entrance
          animation. Keyed like AuditPage keys the same stream: id, else createdAt. */}
      {last ? <span className="ticker-item" key={last.id ?? `${last.createdAt ?? ''}|${last.path}`}>{last.username || 'someone'} · {last.operation} {last.path} → {last.statusCode}</span> : <span className="muted">No admin actions yet…</span>}
    </div>
  )
}

function ImpersonationBanner() {
  const { impersonation, endImpersonation } = useAuth()
  const [, force] = useState(0)
  useEffect(() => {
    if (!impersonation) return
    const t = setInterval(() => force((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [impersonation])
  if (!impersonation) return null
  const msLeft = new Date(impersonation.expiresAt).getTime() - Date.now()
  const mm = Math.max(0, Math.floor(msLeft / 60000))
  const ss = Math.max(0, Math.floor((msLeft % 60000) / 1000)).toString().padStart(2, '0')
  return (
    <div className="impersonation-banner">
      <span className="imp-msg" title={`You are signed in as @${impersonation.targetUsername} — you can look, not change`}>👁 You are signed in as @{impersonation.targetUsername} — you can look, not change · ends in {mm}:{ss}</span>
      <button className="small" onClick={() => navigator.clipboard?.writeText(impersonation.token)}>Copy the key (token)</button>
      <span style={{ flex: 1 }} />
      <button className="small" onClick={endImpersonation}>Stop viewing as this user</button>
    </div>
  )
}

export default function Layout() {
  const { user, logout, logoutAll } = useAuth()
  const loc = useLocation()
  const [navOpen, setNavOpen] = useState(false)
  useEffect(() => { setNavOpen(false) }, [loc.pathname])

  // Landing deep (e.g. /moderation/dataset) must show the highlighted link without
  // hand-scrolling the 40-link nav. 'nearest' never yanks it when already visible.
  useEffect(() => {
    document.querySelector('.sidebar a.navlink.active')?.scrollIntoView({ block: 'nearest' })
  }, [])

  // Escape dismisses the mobile drawer, like any other overlay.
  useEffect(() => {
    if (!navOpen) return
    const onKey = (e) => { if (e.key === 'Escape') setNavOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [navOpen])

  const visible = NAV.filter((n) => n.group || n.roles.includes(user?.role) || user?.role === 'ADMIN')
  // drop group headers that ended up with no visible children
  const items = visible.filter((n, i) => {
    if (!n.group) return true
    const next = visible.slice(i + 1)
    const untilNext = next.findIndex((x) => x.group)
    const children = untilNext === -1 ? next : next.slice(0, untilNext)
    return children.length > 0
  })

  return (
    <div className={`app-shell${navOpen ? ' nav-open' : ''}`}>
      <a className="skip-link" href="#main-content">Skip to the main content</a>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-name">IRC Admin</span>
          <span className="brand-sub">Control room</span>
        </div>
        <nav id="sidebar-nav">
          {items.map((n, i) => n.group
            ? <div className="navgroup" key={`g${i}`}>{n.group}</div>
            : <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `navlink${isActive ? ' active' : ''}`}>{n.label}</NavLink>)}
        </nav>
        <div className="sidebar-foot">
          <span className="avatar">{(user?.username || 'A').slice(0, 1)}</span>
          <span className="who">
            <b>{user?.username}</b>
            <span>{user?.role}</span>
          </span>
        </div>
      </aside>
      {/* Always in the DOM so it can fade in sync with the drawer; CSS gates pointer-events. */}
      <div className="nav-overlay" onClick={() => setNavOpen(false)} />
      <div className="main">
        <ImpersonationBanner />
        <div className="topbar">
          <button className="hamburger" aria-label="Toggle navigation" aria-expanded={navOpen} aria-controls="sidebar-nav" onClick={() => setNavOpen((v) => !v)}>☰</button>
          <span className="page-title">{pageTitleFor(loc.pathname)}</span>
          <HealthChips />
          <div className="spacer" />
          <AuditTicker />
          <button className="small secondary" onClick={logout}>Log out</button>
          <button className="small danger" title="POST /api/v1/auth/logout-all — revoke every session on every device" onClick={logoutAll}>Log out everywhere</button>
        </div>
        <div className="content" id="main-content" key={loc.pathname}>
          <Outlet />
        </div>
        <footer className="app-foot">
          <span className="app-foot-name">IRC Admin</span>
          <span className="app-foot-sub">Control room · Every action here is written down in the records.</span>
        </footer>
      </div>
    </div>
  )
}
