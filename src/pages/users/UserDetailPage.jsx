import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { UsersApi, SafetyApi, AuditApi } from '../../api'
import { useLoad, useAction, fmtBytes, pageRows } from '../../util'
import { Tabs, Err, Ok, Note, Warn, Loading, KV, DataTable, Pager, Badge, StatusBadge, CursorPager, PageIntro, HowTo, Id } from '../../components/ui'
import FormModal from '../../components/FormModal'
import { useAuth } from '../../auth/AuthContext'
import { ROLES } from './UsersListPage'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'security', label: 'Private details' },
  { id: 'sessions', label: 'Logins & devices' },
  { id: 'logins', label: 'Login history' },
  { id: 'settings', label: 'Settings changes' },
  { id: 'moderation', label: 'Warnings & reports' },
  { id: 'audit', label: 'Action history' },
  { id: 'data', label: 'Data & deletion' },
  { id: 'actions', label: 'Account actions' },
]

export default function UserDetailPage() {
  const { id } = useParams()
  const [tab, setTab] = useState('overview')
  const detail = useLoad(() => UsersApi.detail(id), [id])
  const u = detail.data?.user

  return (
    <div>
      <div className="backlink"><Link to="/users">← Back to all users</Link></div>
      <PageIntro
        title="One user"
        lead="Everything we know about one account, and every action you can take on it."
        bullets={[
          'You can read the profile, logins, warnings, and history.',
          'You can change the role, reset the password, or turn the account off.',
          'You can start or stop account deletion.',
          'You can sign in as this user (view only) to see what they see.',
        ]}
      />
      <HowTo steps={[
        'Pick a tab to see one part of the account.',
        'Go to the "Account actions" tab to change the account.',
        'Dangerous actions ask you to type a word first. The server may also ask for your password again (step-up).',
      ]} />
      <h2>
        {u ? <>{u.displayName || u.username} <span className="muted">@{u.username}</span></> : 'User'}
        {u && <span style={{ marginLeft: 10 }}><Badge kind="red">{u.role}</Badge> <StatusBadge value={u.status} /></span>}
      </h2>
      <div className="page-id">user id: {id}</div>
      <Err e={detail.err} />
      <Loading on={detail.loading} />
      {detail.data?.deletion && (
        <Warn>
          This account is set to be deleted. State: {detail.data.deletion.status}.
          It will be deleted forever after {detail.data.deletion.purgeAfter} unless someone stops it
          (see the "Data & deletion" tab).
        </Warn>
      )}
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'overview' && <Overview d={detail.data} />}
      {tab === 'security' && <SecurityTab id={id} d={detail.data} />}
      {tab === 'sessions' && <SessionsTab id={id} />}
      {tab === 'logins' && <PagedTab id={id} fetcher={(p) => UsersApi.loginEvents(id, p)} columns={[
        { key: 'ts', label: 'When' }, { key: 'method', label: 'How' },
        { key: 'outcome', label: 'Result', render: (r) => <StatusBadge value={r.outcome} /> },
        { key: 'ip', label: 'IP address' }, { key: 'coarseGeo', label: 'Rough place' }, { key: 'userAgent', label: 'Device' },
      ]} empty="No logins on record yet."
      note={'Failed logins only started being saved on 11 August 2026. Before that day a failed try was thrown away, so an empty or all-SUCCESS list from earlier does not mean nobody tried.'} />}
      {tab === 'settings' && <PagedTab id={id} fetcher={(p) => UsersApi.settingsAudit(id, p)} columns={[
        { key: 'createdAt', label: 'When' }, { key: 'settingKey', label: 'Which setting' },
        { key: 'oldValue', label: 'Old value' }, { key: 'newValue', label: 'New value' }, { key: 'ip', label: 'IP address' },
      ]} empty="This user has not changed any settings yet." />}
      {tab === 'moderation' && <ModerationTab id={id} />}
      {tab === 'audit' && <AuditTrailTab id={id} />}
      {tab === 'data' && <DataTab id={id} />}
      {tab === 'actions' && <ActionsTab id={id} u={u} reload={detail.reload} />}
    </div>
  )
}

function Overview({ d }) {
  if (!d) return null
  const { user, stats, storage, ...rest } = d
  return (
    <div className="grid2">
      <div className="card">
        <h2>Who this is</h2>
        <KV obj={{
          'Email (partly hidden)': user?.email,
          'Email checked': user?.emailVerified,
          'Phone checked': user?.phoneVerified,
          '2FA on (extra login code)': user?.twoFactorEnabled,
          'Account turned on': user?.enabled,
          'Account locked': user?.locked,
          'Joined': user?.createdAt,
          'Last login': user?.lastLoginAt,
          'First name': rest.fname,
          'Last name': rest.lname,
          'About (bio)': rest.bio,
          'Location': rest.location,
          'Academic title': rest.academicTitle,
          'Institution': rest.institutionName,
          'Website': rest.websiteUrl,
          'ORCID id': rest.orcidId,
          'Language': rest.preferredLanguage,
          'Time zone': rest.timezone,
          'Last change': rest.lastAction,
          'Change note': rest.actionNote,
          'Changed at': rest.updatedAt,
        }} />
      </div>
      <div>
        <div className="card">
          <h2>Numbers</h2>
          {stats ? <KV obj={{
            'Posts': stats.postCount,
            'Reels': stats.reelCount,
            'Research papers': stats.researchCount,
            'Questions': stats.questionCount,
            'Followers': stats.followerCount,
            'Following': stats.followingCount,
          }} /> : <Note>These numbers are not available right now.</Note>}
        </div>
        <div className="card">
          <h2>Storage space used</h2>
          {storage ? <KV obj={{ 'Total': fmtBytes(storage.totalBytes), ...(storage.byType || {}) }} /> : <Note>Storage numbers are not available right now.</Note>}
        </div>
      </div>
    </div>
  )
}

function SecurityTab({ id, d }) {
  const act = useAction()
  const [pii, setPii] = useState(null)
  return (
    <div className="card">
      <h3>Private details (PII)</h3>
      <Note>
        The full email and phone number stay hidden everywhere else. When you show them here,
        the server asks for your password again and writes your look-up into the action history.
      </Note>
      <button disabled={act.busy} title="GET /api/v1/admin/users/{id}/pii" onClick={async () => {
        const res = await act.run(() => UsersApi.pii(id), 'Private details shown. This look-up was recorded.')
        if (res) setPii(res)
      }}>Show private details (extra password check)</button>
      <Err e={act.err} /><Ok msg={act.ok} />
      {pii && <KV obj={{
        'Email': pii.email,
        'Email checked at': pii.emailVerifiedAt,
        'Phone': pii.phoneE164,
        'Phone checked at': pii.phoneVerifiedAt,
      }} />}
      <hr />
      <h3>Checks on this account</h3>
      <KV obj={{
        'Email checked': d?.user?.emailVerified,
        'Phone checked': d?.user?.phoneVerified,
        '2FA on (extra login code)': d?.user?.twoFactorEnabled,
      }} />
      {!d?.user?.emailVerified && (
        <Note>
          Email not checked yet. Ask the person to check it themselves in the app — it emails
          them a 6-number code. Only if they cannot get that code, use the backup button on the
          "Account actions" tab.
        </Note>
      )}
      {d?.user?.phoneVerified && (
        <Warn>
          A phone number checked before 11 August 2026 may have been saved in the wrong shape
          (an extra 0 after the country code). Those numbers work for login but friends can never
          find them by phone. If this person says nobody finds them by phone number, ask them to
          check their phone number again in the app.
        </Warn>
      )}
    </div>
  )
}

function SessionsTab({ id }) {
  const act = useAction()
  const { data, err, loading, reload } = useLoad(() => UsersApi.sessions(id), [id])
  return (
    <div className="card">
      <div className="card-head">
        <h2>Devices where this user is logged in</h2>
        <button className="danger small" disabled={act.busy} title="POST /api/v1/admin/users/{id}/sessions/revoke-all" onClick={async () => {
          await act.run(() => UsersApi.revokeAllSessions(id), 'Done. Every device was logged out.')
          reload()
        }}>Log out ALL devices (extra password check)</button>
      </div>
      <Err e={err} /><Err e={act.err} /><Ok msg={act.ok} />
      <DataTable
        columns={[
          { key: 'sid', label: 'Login id (sid)', render: (r) => <Id v={r.sid} /> },
          { key: 'deviceName', label: 'Device' }, { key: 'platform', label: 'Platform' },
          { key: 'ip', label: 'IP address' }, { key: 'lastSeenAt', label: 'Last used' },
          { key: 'trusted', label: 'Trusted' }, { key: 'revoked', label: 'Logged out' },
          { key: '_', label: '', render: (r) => <button className="small danger" title="DELETE /api/v1/admin/users/{id}/sessions/{sid}" onClick={async (e) => { e.stopPropagation(); await act.run(() => UsersApi.revokeSession(id, r.sid), 'That device was logged out.'); reload() }}>Log out</button> },
        ]}
        rows={data || []}
        loading={loading}
        rowKey={(r) => r.sid}
        empty="No devices are logged in right now."
      />
    </div>
  )
}

function PagedTab({ id, fetcher, columns, empty, note }) {
  const [page, setPage] = useState(0)
  const { data, err, loading } = useLoad(() => fetcher({ page, size: 25 }), [id, page])
  return (
    <div className="card">
      {note && <Note>{note}</Note>}
      <Err e={err} />
      <DataTable columns={columns} rows={pageRows(data)} loading={loading} empty={empty || 'Nothing here yet.'} />
      <Pager data={data} page={page} onPage={setPage} />
    </div>
  )
}

function AuditTrailTab({ id }) {
  // GET /api/v1/admin/audit/users/{userId} — keyset-paged per-user history (180-day keep)
  const act = useAction()
  const [rows, setRows] = useState(null)
  const [lastBatch, setLastBatch] = useState(null)
  const load = async (cursor) => {
    const res = await act.run(() => AuditApi.byUser(id, { pageSize: 50, cursor }))
    if (res) { setLastBatch(res.length); setRows((prev) => (cursor ? [...(prev || []), ...res] : res)) }
  }
  useEffect(() => { load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="card">
      <Note>
        Every action recorded on this account, newest first. We keep these rows for 180 days.
        For a full search across all users, go to Records → Admin action history.
      </Note>
      <Err e={act.err} />
      <DataTable
        columns={[
          { key: 'createdAt', label: 'When' },
          { key: 'operation', label: 'Action' },
          { key: 'outcome', label: 'Result', render: (r) => <StatusBadge value={r.outcome} /> },
          { key: 'path', label: 'Where (for engineers)', render: (r) => <code>{r.httpMethod} {r.path}</code> },
          { key: 'statusCode', label: 'Result code' },
          { key: 'durationMs', label: 'Time taken (ms)' },
          { key: 'ipAddress', label: 'IP address' },
          { key: 'summary', label: 'Short note' },
        ]}
        rows={rows || []}
        loading={act.busy}
        tall
        empty="No history rows. Rows older than 180 days are removed."
      />
      <CursorPager rows={rows || []} pageSize={50} lastBatch={lastBatch} onMore={(c) => load(c)} />
    </div>
  )
}

function ModerationTab({ id }) {
  const act = useAction()
  const { data, err, loading, reload } = useLoad(() => UsersApi.moderation(id), [id])
  const [strikeOpen, setStrikeOpen] = useState(false)
  const reportCols = [
    { key: 'createdAt', label: 'When' }, { key: 'targetType', label: 'What was reported' },
    { key: 'reason', label: 'Why' }, { key: 'state', label: 'State', render: (r) => <StatusBadge value={r.state} /> },
    { key: 'resolution', label: 'Outcome' },
    { key: 'id', label: '', render: (r) => <Link to={`/safety/reports/${r.id}`}>open</Link> },
  ]
  return (
    <div>
      <div className="card">
        <div className="card-head">
          <h2>Warnings (strikes) — active now: {data?.activeStrikes ?? '—'}</h2>
          <button className="small" onClick={() => setStrikeOpen(true)}>Give a warning (strike)…</button>
        </div>
        <Err e={err} /><Err e={act.err} /><Ok msg={act.ok} />
        <DataTable
          columns={[
            { key: 'issuedAt', label: 'Given at' }, { key: 'reason', label: 'Why' },
            { key: 'active', label: 'Active' }, { key: 'expiresAt', label: 'Ends by itself at' },
            { key: 'reportId', label: 'Linked report', render: (r) => <Id v={r.reportId} /> },
            { key: '_', label: '', render: (r) => r.active ? <button className="small danger" title="DELETE /api/v1/admin/safety/strikes/{id}" onClick={async (e) => { e.stopPropagation(); await act.run(() => SafetyApi.revokeStrike(r.id, 'Cancelled from the user page'), 'Warning cancelled.'); reload() }}>Cancel this warning</button> : null },
          ]}
          rows={data?.strikes || []}
          loading={loading}
          empty="No warnings. This user has a clean record."
        />
      </div>
      <div className="card"><h2>Reports about this user</h2><DataTable columns={reportCols} rows={data?.reportsAgainst || []} loading={loading} empty="No one has reported this user." /></div>
      <div className="card"><h2>Reports this user sent</h2><DataTable columns={reportCols} rows={data?.reportsFiled || []} loading={loading} empty="This user has not reported anyone." /></div>
      {strikeOpen && (
        <FormModal
          title="Give a warning (strike)"
          intro="The warning ends by itself after about 90 days. The user gets a message with the reason type — never the reporter's name."
          fields={[
            { name: 'reason', label: 'Why? * (up to 200 letters)', type: 'textarea', required: true },
            { name: 'reportId', label: 'Linked report id (optional)' },
          ]}
          submitLabel="Give the warning (extra password check)"
          onSubmit={async (v) => { await UsersApi.issueStrike(id, v); reload() }}
          onClose={() => setStrikeOpen(false)}
        />
      )}
    </div>
  )
}

function DataTab({ id }) {
  const { data, err, loading, reload, setData } = useLoad(() => UsersApi.data(id), [id])
  const act = useAction()
  const [modal, setModal] = useState(null)
  const refresh = (res) => { if (res) setData(res); else reload() }
  return (
    <div className="card">
      <Err e={err} /><Err e={act.err} /><Ok msg={act.ok} />
      <Loading on={loading} />
      <h3>Account deletion — where it stands</h3>
      {data?.deletion ? <KV obj={{
        'State': data.deletion.status,
        'Asked for at': data.deletion.requestedAt,
        'Deleted forever after': data.deletion.purgeAfter,
        ...(data.deletion.resolvedAt ? { 'Finished at': data.deletion.resolvedAt } : {}),
      }} /> : <Note>No deletion request. This account is not being deleted.</Note>}
      <KV obj={{ 'Fully deleted (tombstone)': data?.tombstoned }} />
      <div className="row mt-2">
        <button className="danger" title="POST /api/v1/admin/users/{id}/deletion/request" onClick={() => setModal('request')}>Start account deletion…</button>
        <button className="secondary" disabled={act.busy} title="POST /api/v1/admin/users/{id}/deletion/cancel" onClick={async () => refresh(await act.run(() => UsersApi.deletionCancel(id), 'Deletion stopped. The account is back.'))}>Stop the deletion (extra password check)</button>
        <button className="danger" title="POST /api/v1/admin/users/{id}/purge/now" onClick={() => setModal('purge')}>Delete forever NOW…</button>
        <button className="secondary" title="POST /api/v1/admin/users/{id}/purge/hold" onClick={() => setModal('hold')}>Delay the final delete…</button>
      </div>
      <h3>Data export jobs (the user's copy of their own data)</h3>
      <DataTable
        columns={[
          { key: 'id', label: 'Job id', render: (r) => <Id v={r.id} /> }, { key: 'status', label: 'State', render: (r) => <StatusBadge value={r.status} /> },
          { key: 'sizeBytes', label: 'Size', render: (r) => fmtBytes(r.sizeBytes) },
          { key: 'createdAt', label: 'Started' }, { key: 'readyAt', label: 'Ready at' }, { key: 'expiresAt', label: 'Link stops working at' },
        ]}
        rows={data?.exportJobs || []}
        loading={loading}
        empty="No data exports yet."
      />
      {modal === 'request' && (
        <FormModal title="Start account deletion" danger requireText="DELETE"
          intro="This hides the account right away and logs out every device. After 30 days the account is deleted forever — unless someone stops it before then."
          fields={[{ name: 'reason', label: 'Why? (up to 500 letters)', type: 'textarea' }]}
          submitLabel="Start deletion (extra password check)"
          onSubmit={async (v) => refresh(await UsersApi.deletionRequest(id, v.reason))}
          onClose={() => setModal(null)} />
      )}
      {modal === 'purge' && (
        <FormModal title="Delete forever NOW" danger requireText="PURGE"
          intro="This deletes the account and its private data forever, right now — it does not wait for the 30 days. You cannot undo it."
          fields={[]}
          submitLabel="Delete forever now (extra password check)"
          onSubmit={async () => refresh(await UsersApi.purgeNow(id))}
          onClose={() => setModal(null)} />
      )}
      {modal === 'hold' && (
        <FormModal title="Delay the final delete"
          intro="Adds more days before the account is deleted forever — for example, for a legal case. You can add 1 to 365 days."
          fields={[{ name: 'days', label: 'Days to add', type: 'number', value: 30, required: true }]}
          submitLabel="Add the days (extra password check)"
          onSubmit={async (v) => refresh(await UsersApi.purgeHold(id, v.days))}
          onClose={() => setModal(null)} />
      )}
    </div>
  )
}

function ActionsTab({ id, u, reload }) {
  const act = useAction()
  const { startImpersonation } = useAuth()
  const [modal, setModal] = useState(null)
  const [pwResult, setPwResult] = useState(null)
  const done = (msg) => { act.setOk(msg || 'Done.'); reload() }

  return (
    <div>
      <Err e={act.err} /><Ok msg={act.ok} />
      {pwResult && (
        <Warn>
          New temporary password (shown only ONCE): <code>{pwResult.temporaryPassword}</code> —
          {pwResult.sessionsRevoked} device login(s) were ended. Copy it now and give it to the user in a safe way.
        </Warn>
      )}
      <div className="card">
        <h2>Role and name</h2>
        <div className="row">
          <button title="PATCH /api/v1/admin/users/{id}/role" onClick={() => setModal('role')}>Change role…</button>
          <button className="secondary" title="PATCH /api/v1/admin/users/{id}" onClick={() => setModal('edit')}>Edit name, username, or email…</button>
          <button className="secondary" disabled={act.busy || u?.emailVerified} title="POST /api/v1/admin/users/{id}/email/verify" onClick={async () => { await act.run(() => UsersApi.emailVerify(id), 'Email marked as checked.'); reload() }}>
            {u?.emailVerified ? 'Email is already checked' : 'Mark email as checked (backup way)'}
          </button>
        </div>
        <Note>
          The server protects you: you cannot change your own role, and the last ADMIN cannot lose the ADMIN role.
          A role change starts at the person's next login — to make it start now, also log out all their devices.
        </Note>
        <Note>
          "Mark email as checked" is the <strong>backup way</strong>, not the normal one. People check their
          own email in the app: it sends them a 6-number code (3 times per hour), and the code lasts 15 minutes.
          Ask the person to do that first. Use this button only when they really cannot get the code.
          Both ways set the same flag, and it also gives them 50 points on their security checkup.
        </Note>
      </div>
      <div className="card">
        <h2>Password and 2FA (extra login code)</h2>
        <div className="row">
          <button className="danger" title="POST /api/v1/admin/users/{id}/password/reset" onClick={() => setModal('password')}>Reset password…</button>
          <button className="danger" title="POST /api/v1/admin/users/{id}/2fa/reset" onClick={() => setModal('2fa')}>Reset 2FA…</button>
        </div>
        <Note>Both actions log the user out of every device and send them a message right away.</Note>
      </div>
      <div className="card">
        <h2>Turn the account on or off</h2>
        <div className="row">
          {u?.enabled
            ? <button className="danger" title="POST /api/v1/admin/users/{id}/disable" onClick={() => setModal('disable')}>Turn off this account…</button>
            : <button disabled={act.busy} title="POST /api/v1/admin/users/{id}/enable" onClick={async () => { await act.run(() => UsersApi.enable(id), 'Account turned on again.'); reload() }}>Turn on this account (extra password check)</button>}
          {u?.locked
            ? <button disabled={act.busy} title="POST /api/v1/admin/users/{id}/unlock" onClick={async () => { await act.run(() => UsersApi.unlock(id), 'Account unlocked.'); reload() }}>Unlock this account (extra password check)</button>
            : <button className="danger" title="POST /api/v1/admin/users/{id}/lock" onClick={() => setModal('lock')}>Lock this account…</button>}
        </div>
        <Note>
          "Turn off" and "Lock" both stop the user from logging in. The difference:
          when you turn an account off, the user gets a message; when you lock it, they get no message.
        </Note>
      </div>
      <div className="card">
        <h2>Sign in as this user (view only)</h2>
        <Note>
          You get a special key for 15 minutes. You can only look — every change is blocked.
          Every page you open is recorded with your name and theirs. You cannot do this to another admin.
        </Note>
        <button title="POST /api/v1/admin/users/{id}/impersonate" onClick={() => setModal('impersonate')}>Sign in as this user (view only)…</button>
      </div>
      {modal === 'role' && (
        <FormModal title="Change role" danger
          intro="The user's badge follows the role by itself. The server asks for your password again."
          fields={[
            { name: 'role', label: 'New role *', type: 'select', options: ROLES, required: true, value: u?.role },
            { name: 'reason', label: 'Why? (optional, up to 500 letters)', type: 'textarea' },
          ]}
          submitLabel="Save the new role (extra password check)"
          onSubmit={async (v) => { await UsersApi.changeRole(id, v.role, v.reason); done('Role changed.') }}
          onClose={() => setModal(null)} />
      )}
      {modal === 'edit' && (
        <FormModal title="Edit name, username, or email"
          intro="Only the boxes you fill in will change. If you change the email, it becomes 'not checked' again and the user must check it again — they can do that themselves in the app, which emails them a 6-number code. Changing the email also moves how friends find this person by their contacts, so the old address stops working for that."
          fields={[
            { name: 'fname', label: 'First name' }, { name: 'lname', label: 'Last name' },
            { name: 'username', label: 'Username (3–50 letters)' }, { name: 'email', label: 'Email' },
          ]}
          submitLabel="Save changes (extra password check)"
          onSubmit={async (v) => { await UsersApi.edit(id, v); done('Saved.') }}
          onClose={() => setModal(null)} />
      )}
      {modal === 'password' && (
        <FormModal title="Reset password" danger requireText="RESET"
          intro="This sets a temporary password and logs the user out of every device. You will see the new password only once — copy it right away."
          fields={[{ name: 'temporaryPassword', label: 'Temporary password (leave empty = we make one for you, 8–128 letters)' }]}
          submitLabel="Reset the password (extra password check)"
          onSubmit={async (v) => {
            const res = await UsersApi.passwordReset(id, v.temporaryPassword ? { temporaryPassword: v.temporaryPassword } : {})
            setPwResult(res); done('Password reset. The new password is shown above — only once.')
          }}
          onClose={() => setModal(null)} />
      )}
      {modal === '2fa' && (
        <FormModal title="Reset 2FA (extra login code)" danger requireText="RESET-2FA"
          intro="Be careful: this is the classic way accounts get stolen. Check who is really asking first. The user is logged out everywhere and gets a message."
          fields={[{ name: 'reason', label: 'Why? * (for example: support ticket number)', type: 'textarea', required: true }]}
          submitLabel="Reset 2FA (extra password check)"
          onSubmit={async (v) => { await UsersApi.twoFaReset(id, v.reason); done('2FA reset. The user was told.') }}
          onClose={() => setModal(null)} />
      )}
      {modal === 'disable' && (
        <FormModal title="Turn off this account" danger
          intro="The user cannot log in any more. Every device is logged out. The user gets a message."
          fields={[{ name: 'reason', label: 'Why? (up to 500 letters)', type: 'textarea' }]}
          submitLabel="Turn off the account (extra password check)"
          onSubmit={async (v) => { await UsersApi.disable(id, v.reason); done('Account turned off.') }}
          onClose={() => setModal(null)} />
      )}
      {modal === 'lock' && (
        <FormModal title="Lock this account" danger
          intro="Blocks login and logs out every device. The user gets NO message (different from turning the account off)."
          fields={[{ name: 'reason', label: 'Why? (up to 500 letters)', type: 'textarea' }]}
          submitLabel="Lock the account (extra password check)"
          onSubmit={async (v) => { await UsersApi.lock(id, v.reason); done('Account locked.') }}
          onClose={() => setModal(null)} />
      )}
      {modal === 'impersonate' && (
        <FormModal title="Sign in as this user (view only)" danger
          intro="Write why you need this (at least 10 letters). It is recorded with your name and theirs. It lasts 15 minutes and you can only look, not change."
          fields={[{ name: 'reason', label: 'Why? * (at least 10 letters)', type: 'textarea', required: true }]}
          submitLabel="Start viewing (extra password check)"
          onSubmit={async (v) => {
            const grant = await UsersApi.impersonate(id, v.reason)
            startImpersonation(grant)
            act.setOk(`You are now viewing as @${grant.targetUsername}. The key is kept in memory only and stops in 15 minutes.`)
          }}
          onClose={() => setModal(null)} />
      )}
    </div>
  )
}
