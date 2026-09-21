import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnalyticsApi, OpsApi } from '../api'
import { subscribeAudit } from '../api/auditStream'
import { useLoad, fmtNum, fmtBytes } from '../util'
import { Tiles, DataTable, Err, Loading, Note, KV, StatusBadge, PageIntro, HowTo } from '../components/ui'
import { useAuth } from '../auth/AuthContext'

export default function HomePage() {
  const { user } = useAuth()
  const canAnalytics = ['ADMIN', 'ANALYST'].includes(user?.role)
  const overview = useLoad(() => canAnalytics ? AnalyticsApi.overview() : Promise.resolve(null), [canAnalytics])
  const health = useLoad(() => user?.role === 'ADMIN' ? OpsApi.health() : Promise.resolve(null), [user?.role])
  const [audit, setAudit] = useState({ rows: [], status: 'idle' })
  useEffect(() => subscribeAudit(setAudit), [])

  const o = overview.data
  const adminRows = audit.rows.filter((r) => (r.path || '').startsWith('/api/v1/admin/')).slice(0, 12)

  return (
    <div>
      <PageIntro
        title="Home"
        lead="Welcome! This is the admin dashboard. It shows how the app is doing right now."
        bullets={[
          'You can see today’s numbers: users, sign-ups, and open reports.',
          'You can see if all parts of the system are working.',
          'You can watch what other admins are doing, live.',
          'Use the menu on the left to go to any work area.',
        ]}
      />
      <HowTo title="New here? How this dashboard works" steps={[
        'The left menu is split into groups, like "People" and "Check content". Click a name to open that page.',
        'Every page starts with a short note that tells you what the page does.',
        'Green means good. Red means a problem. Blue means waiting.',
        'Big actions (like deleting) will ask you to type your password again. This is normal. It keeps the app safe.',
        'Everything you do here is written down in "Admin action history". Nothing is secret.',
      ]} />
      <Err e={overview.err} />
      <Loading on={overview.loading && canAnalytics} />
      {o && (
        <Tiles items={[
          { label: 'All users', value: fmtNum(o.totalUsers) },
          { label: 'New users today', value: fmtNum(o.signupsToday) },
          { label: 'Used the app today', value: fmtNum(o.dauToday) },
          { label: 'Used the app this month', value: o.mau30d === -1 ? 'not ready' : fmtNum(o.mau30d) },
          { label: 'Online right now', value: fmtNum(o.onlineNow) },
          { label: 'Live streams now', value: fmtNum(o.liveNow) },
          { label: 'Reports waiting', value: fmtNum(o.openReports), sub: `${fmtNum(o.appealBacklog)} appeals waiting` },
          { label: 'Research papers live', value: fmtNum(o.publishedResearch), sub: `${fmtNum(o.totalResearch)} in total` },
          { label: 'Questions asked', value: fmtNum(o.questions) },
          { label: 'Storage used', value: fmtBytes(o.storageBytes) },
          { label: 'Gift coins (all time)', value: fmtNum(o.giftCoinsAllTime) },
        ]} />
      )}
      {o?.conversationsByType && (
        <div className="card">
          <h2>Chats by type</h2>
          <p className="footnote">How many chats exist, by kind. We only count them — we never read them.</p>
          <KV obj={o.conversationsByType} />
        </div>
      )}

      {user?.role === 'ADMIN' && (
        <div className="card">
          <div className="card-head">
            <h2>Is everything working?</h2>
            <span className="card-head-action"><Link to="/ops">→ open System health</Link></span>
          </div>
          <p className="footnote">Each badge is one part of the system. Green (UP) is good. Red (DOWN) needs help.</p>
          <Err e={health.err} />
          {health.data && (
            <div className="row">
              {Object.entries(health.data).map(([dep, v]) => (
                <span key={dep}>
                  <StatusBadge value={v?.status || 'UNKNOWN'} /> {dep}{v?.latencyMs != null ? <span className="muted"> {v.latencyMs}ms</span> : null}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h2>What admins are doing right now</h2>
          <span className="card-head-action muted">(live feed)</span>
        </div>
        {audit.status !== 'open' && <Note>The live feed is {audit.status === 'error' ? 'not working right now' : 'starting up'}. New admin actions will show here when it connects.</Note>}
        <DataTable
          columns={[
            { key: 'createdAt', label: 'When' },
            { key: 'username', label: 'Who' },
            { key: 'operation', label: 'What they did' },
            { key: 'path', label: 'Where (for engineers)', render: (r) => <code>{r.httpMethod} {r.path}</code> },
            { key: 'statusCode', label: 'Result code' },
            { key: 'summary', label: 'Short note' },
          ]}
          rows={adminRows}
          loading={audit.status === 'idle' || audit.status === 'connecting'}
          empty="No admin actions yet. When an admin changes something, it shows here right away."
        />
      </div>
    </div>
  )
}
