import React, { useState } from 'react'
import { UsersApi } from '../../api'
import { useLoad, fmtNum } from '../../util'
import { Tiles, Err, Note, Loading, KV, SeriesBars, Field, PageIntro, HowTo } from '../../components/ui'

export default function UsersAnalyticsPage() {
  const [window, setWindow] = useState(90)
  const { data, err, loading } = useLoad(() => UsersApi.analytics(window), [window])
  const d = data
  const signupsSeries = d?.signupsByDay
    ? Object.fromEntries(d.signupsByDay.map((r) => [r.day, r.count]))
    : null
  // Sign-up steps (funnel): counts computed from the percentages the API returns.
  const total = d?.totalUsers
  const funnel = total != null ? {
    '1) Signed up': total,
    '2) Email checked': d.emailVerifiedPct != null ? Math.round(total * d.emailVerifiedPct / 100) : 0,
    '3) Phone checked': d.phoneVerifiedPct != null ? Math.round(total * d.phoneVerifiedPct / 100) : 0,
    '4) 2FA turned on': d.twoFactorPct != null ? Math.round(total * d.twoFactorPct / 100) : 0,
  } : null
  const cf = d?.closeFriends
  const ses = d?.sessions
  return (
    <div>
      <PageIntro
        title="User growth"
        lead="See how many people use the app, and how fast that number grows."
        bullets={[
          'You can see totals: all users, new users, and safety checks.',
          'You can change how many days the chart shows.',
          'You can see how many accounts are being deleted.',
        ]}
      />
      <HowTo steps={[
        'Pick how many days to look at (1 to 365).',
        'Read the tiles at the top for quick totals.',
        'Scroll down for the charts and breakdowns.',
      ]} />
      <div className="filters">
        <Field label="Days to show (1–365)">
          <input type="number" min={1} max={365} value={window} onChange={(e) => setWindow(Number(e.target.value) || 90)} />
        </Field>
      </div>
      <Err e={err} /><Loading on={loading} />
      {d && (
        <>
          <Tiles items={[
            { label: 'All users', value: fmtNum(d.totalUsers) },
            { label: 'Joined today', value: fmtNum(d.signupsToday) },
            { label: 'Joined in the last 7 days', value: fmtNum(d.signups7d) },
            { label: 'Emails checked', value: d.emailVerifiedPct != null ? `${d.emailVerifiedPct}%` : '—' },
            { label: 'Phones checked', value: d.phoneVerifiedPct != null ? `${d.phoneVerifiedPct}%` : '—' },
            { label: '2FA on (extra login code)', value: d.twoFactorPct != null ? `${d.twoFactorPct}%` : '—' },
          ]} />
          <div className="grid2">
            <div className="card">
              <h2>New users per day</h2>
              <SeriesBars series={signupsSeries} limit={45} />
            </div>
            <div className="card">
              <h2>Sign-up steps (step-by-step count)</h2>
              <Note>Each step is a part of the one before it: joined → email checked → phone checked → 2FA on.</Note>
              <SeriesBars series={funnel} />
            </div>
            <div className="card">
              <h2>Users by role</h2>
              <KV obj={d.roleDistribution} />
            </div>
            <div className="card">
              <h2>Accounts being deleted</h2>
              <Note>PENDING_DELETION = waiting to be deleted. CANCELLED = someone stopped it. PURGED = deleted forever.</Note>
              <KV obj={d.deletionPipeline} />
            </div>
            <div className="card">
              <h2>Close friends lists</h2>
              {cf && !cf.error ? (
                <>
                  <KV obj={{
                    'Users with a list': fmtNum(cf.usersWithList),
                    'Share of all users': cf.adoptionPct != null ? `${cf.adoptionPct}%` : '—',
                    'Total list entries': fmtNum(cf.totalEdges),
                  }} />
                  {cf.listSizeHistogram && (
                    <>
                      <h4>How big the lists are</h4>
                      <KV obj={cf.listSizeHistogram} />
                    </>
                  )}
                </>
              ) : <Note>These numbers are not available right now.</Note>}
            </div>
            <div className="card">
              <h2>Device logins per user</h2>
              {ses && !ses.error ? (
                <KV obj={{
                  'Typical user (middle)': ses.p50,
                  'Heavy user (top 5%)': ses.p95,
                  'Average': ses.avg,
                  'Most for one user': ses.max,
                  'Users logged in somewhere now': fmtNum(ses.usersWithLiveSessions),
                }} />
              ) : <Note>These numbers are not available right now.</Note>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
