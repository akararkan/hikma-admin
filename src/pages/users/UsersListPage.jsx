import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { UsersApi } from '../../api'
import { useLoad, useAction, pageRows, useDebounced } from '../../util'
import { DataTable, Pager, Err, Ok, Field, Select, Badge, StatusBadge, PageIntro, HowTo, Id } from '../../components/ui'
import FormModal from '../../components/FormModal'

export const ROLES = ['USER', 'RESEARCHER', 'SCHOLAR', 'MODERATOR', 'SUPPORT', 'ANALYST', 'ADMIN']
const STATUSES = [
  { value: 'ACTIVE', label: 'Active (normal)' },
  { value: 'DISABLED', label: 'Turned off (disabled)' },
  { value: 'DELETED', label: 'Deleted' },
  { value: 'LOCKED', label: 'Locked — this filter works only together with a search word' },
]
const BULK_ACTIONS = [
  { value: 'DISABLE', label: 'Turn off the accounts (disable)' },
  { value: 'ENABLE', label: 'Turn on the accounts (enable)' },
  { value: 'LOCK', label: 'Lock the accounts' },
  { value: 'UNLOCK', label: 'Unlock the accounts' },
  { value: 'REQUEST_DELETION', label: 'Start account deletion' },
  { value: 'CHANGE_ROLE', label: 'Change role' },
]

export default function UsersListPage() {
  const nav = useNavigate()
  const [filters, setFilters] = useState({ q: '', role: undefined, status: undefined, verified: undefined, from: '', to: '' })
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState([])
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkResult, setBulkResult] = useState(null)
  const act = useAction()

  const df = useDebounced(filters, 300)
  const { data, err, loading, reload } = useLoad(
    () => UsersApi.list({ ...df, page, size: 25 }),
    [JSON.stringify(df), page]
  )
  const rows = pageRows(data)
  const setF = (k, v) => { setPage(0); setFilters((s) => ({ ...s, [k]: v })) }
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const pageIds = rows.map((r) => r.id)
  const allPicked = pageIds.length > 0 && pageIds.every((x) => selected.includes(x))
  const togglePage = () => setSelected((s) => (allPicked ? s.filter((x) => !pageIds.includes(x)) : [...new Set([...s, ...pageIds])]))

  return (
    <div>
      <PageIntro
        title="All users"
        lead="Find any user account and open it."
        bullets={[
          'You can search by name, username, or email.',
          'You can filter by role, account state, and join date.',
          'You can tick many users and run one action on all of them.',
          'You can click a row to open that user.',
        ]}
      />
      <HowTo steps={[
        'Type a name, @username, or email in the search box.',
        'Use the filters to narrow the list.',
        'Use "From" and "To" to see only people who joined between two dates.',
        'Click a row to open the user and see everything about them.',
        'To act on many users at once: tick their boxes, then click "Run one action on picked users".',
      ]} />
      <div className="toolbar">
        <Link to="/users/new"><button>+ Add users</button></Link>
        <button className="secondary" onClick={() => { setBulkResult(null); setBulkOpen(true) }}>
          Run one action on picked users{selected.length ? ` (${selected.length} picked)` : '…'}
        </button>
        <Link to="/users/analytics"><button className="secondary">User growth</button></Link>
      </div>
      <div className="filters">
        <Field label="Search"><input value={filters.q} onChange={(e) => setF('q', e.target.value)} placeholder="Name, @username, or email" /></Field>
        <Field label="Role"><Select value={filters.role} onChange={(v) => setF('role', v)} options={ROLES} emptyLabel="(all roles)" /></Field>
        <Field label="Account state"><Select value={filters.status} onChange={(v) => setF('status', v)} options={STATUSES} emptyLabel="(any state)" /></Field>
        <Field label="Email checked?"><Select value={filters.verified} onChange={(v) => setF('verified', v)} options={[{ value: 'true', label: 'Yes — checked' }, { value: 'false', label: 'No — not checked' }]} emptyLabel="(any)" /></Field>
        <Field label="From"><input type="datetime-local" value={filters.from} onChange={(e) => setF('from', e.target.value)} /></Field>
        <Field label="To"><input type="datetime-local" value={filters.to} onChange={(e) => setF('to', e.target.value)} /></Field>
        <button className="secondary" onClick={reload}>Refresh the list</button>
      </div>
      <Err e={err} />
      <DataTable
        columns={[
          {
            key: '_pick',
            label: <input type="checkbox" checked={allPicked} onChange={togglePage} title="Pick every user on this page" />,
            render: (r) => <input type="checkbox" checked={selected.includes(r.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(r.id)} />,
          },
          { key: 'username', label: 'User', render: (r) => <span><strong>{r.displayName || r.username}</strong> <span className="muted">@{r.username}</span></span> },
          { key: 'email', label: 'Email (partly hidden)' },
          { key: 'role', label: 'Role', render: (r) => <Badge kind="red">{r.role}</Badge> },
          { key: 'status', label: 'State', render: (r) => <StatusBadge value={r.status} /> },
          { key: 'emailVerified', label: 'Email checked' },
          { key: 'twoFactorEnabled', label: '2FA on (extra login code)' },
          { key: 'createdAt', label: 'Joined' },
          { key: 'lastLoginAt', label: 'Last login' },
        ]}
        rows={rows}
        loading={loading}
        tall
        onRow={(r) => nav(`/users/${r.id}`)}
        empty="No users match. Try fewer filters, or check the spelling."
      />
      <Pager data={data} page={page} onPage={setPage} />

      <Err e={act.err} /><Ok msg={act.ok} />
      {bulkResult && (
        <div className="card">
          <h2>Results — one line per user</h2>
          <DataTable
            columns={[
              { key: 'id', label: 'User id', render: (r) => <Id v={r.id} /> },
              { key: 'outcome', label: 'Result', render: (r) => <StatusBadge value={r.outcome === 'ok' ? 'SUCCESS' : 'FAILED'} /> },
              { key: 'error', label: 'Problem (if any)' },
            ]}
            rows={bulkResult}
          />
        </div>
      )}
      {bulkOpen && (
        <FormModal
          title="Run one action on many users (up to 100)"
          danger
          requireText="BULK"
          intro="This runs the same action on every user in the list below. Each user gets their own result line. The server blocks unsafe moves (for example, you cannot turn off your own account)."
          fields={[
            { name: 'ids', label: 'User ids (one per line, or with commas)', type: 'textarea', required: true, value: selected.join('\n') },
            { name: 'action', label: 'What to do', type: 'select', options: BULK_ACTIONS, required: true },
            { name: 'role', label: 'New role (only for "Change role")', type: 'select', options: ROLES },
            { name: 'reason', label: 'Why? (optional, up to 500 letters)', type: 'textarea' },
          ]}
          submitLabel="Run the action (extra password check)"
          onSubmit={async (v) => {
            const ids = String(v.ids).split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)
            const res = await act.run(() => UsersApi.bulkAction({ ids, action: v.action, role: v.role, reason: v.reason }), 'Done. Check the result line for each user below.')
            if (res) { setBulkResult(res); setSelected([]); reload() }
          }}
          onClose={() => setBulkOpen(false)}
        />
      )}
    </div>
  )
}
