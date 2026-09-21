import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { UsersApi } from '../../api'
import { useAction } from '../../util'
import { Err, Ok, Note, DataTable, StatusBadge, JsonBlock, Field, Select, Tabs, PageIntro, HowTo } from '../../components/ui'
import { ROLES } from './UsersListPage'

export default function UserCreatePage() {
  const [tab, setTab] = useState('create')
  return (
    <div>
      <PageIntro
        title="Add users"
        lead="Make new accounts, or invite people by email."
        bullets={[
          'You can add one user with a form.',
          'You can add many users at once by pasting a list (CSV).',
          'You can send an email invite, send it again, or cancel it.',
        ]}
      />
      <Tabs
        tabs={[
          { id: 'create', label: 'Add one user' },
          { id: 'bulk', label: 'Add many at once (CSV)' },
          { id: 'invite', label: 'Invites' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'create' && <CreateOne />}
      {tab === 'bulk' && <BulkImport />}
      {tab === 'invite' && <Invites />}
    </div>
  )
}

function CreateOne() {
  const act = useAction()
  const [f, setF] = useState({ fname: '', lname: '', username: '', email: '', role: 'USER', temporaryPassword: '', sendInvite: false, markEmailVerified: false })
  const [created, setCreated] = useState(null)
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const submit = async (e) => {
    e.preventDefault()
    const body = { ...f }
    if (!body.temporaryPassword) delete body.temporaryPassword
    const res = await act.run(() => UsersApi.create(body), 'User created.')
    if (res) setCreated(res)
  }
  return (
    <form className="card" onSubmit={submit}>
      <HowTo steps={[
        "Type the person's first name, last name, username, and email.",
        'Pick a role. Most people should stay USER.',
        'Choose ONE way to log in: type a temporary password, OR tick "Send an invite email".',
        'Click "Create this user". You may get an extra password check (step-up).',
      ]} />
      <Note>
        You must give a temporary password OR tick "Send an invite email". If you do neither,
        the person has no way to log in. Tick "Mark email as checked" only for people you trust
        (for example, staff). You can leave it off: since 11 August 2026 people can check their
        own email in the app, and the app emails them a 6-number code when they join.
      </Note>
      <div className="form-grid">
        <Field label="First name *"><input value={f.fname} onChange={(e) => set('fname', e.target.value)} /></Field>
        <Field label="Last name *"><input value={f.lname} onChange={(e) => set('lname', e.target.value)} /></Field>
        <Field label="Username * (3–50 letters)"><input value={f.username} onChange={(e) => set('username', e.target.value)} /></Field>
        <Field label="Email *"><input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Role"><Select value={f.role} onChange={(v) => set('role', v || 'USER')} options={ROLES} allowEmpty={false} /></Field>
        <Field label="Temporary password (8–128 letters)"><input value={f.temporaryPassword} onChange={(e) => set('temporaryPassword', e.target.value)} /></Field>
        <Field label="Send an invite email (set-password link)"><input type="checkbox" checked={f.sendInvite} onChange={(e) => set('sendInvite', e.target.checked)} /></Field>
        <Field label="Mark email as checked (verified)"><input type="checkbox" checked={f.markEmailVerified} onChange={(e) => set('markEmailVerified', e.target.checked)} /></Field>
      </div>
      <Err e={act.err} /><Ok msg={act.ok} />
      <button disabled={act.busy} title="POST /api/v1/admin/users">{act.busy ? 'Creating…' : 'Create this user (extra password check)'}</button>
      {created && (
        <div className="mt-2">
          <Note>
            The new account is ready. <Link to={`/users/${created.user?.id || created.id}`}>Open the new user</Link>.
          </Note>
          <JsonBlock v={created} />
        </div>
      )}
    </form>
  )
}

function BulkImport() {
  const act = useAction()
  const [text, setText] = useState('')
  const [results, setResults] = useState(null)
  const parse = () => {
    const t = text.trim()
    if (!t) return []
    if (t.startsWith('[')) return JSON.parse(t)
    // CSV: fname,lname,username,email[,role[,temporaryPassword]]
    return t.split(/\n+/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const [fname, lname, username, email, role, temporaryPassword] = line.split(',').map((s) => s?.trim())
      const row = { fname, lname, username, email }
      if (role) row.role = role
      if (temporaryPassword) row.temporaryPassword = temporaryPassword
      return row
    })
  }
  const submit = async () => {
    let rows
    try { rows = parse() } catch (e) { act.setErr({ message: `We could not read your list: ${e.message}` }); return }
    if (!rows.length) { act.setErr({ message: 'The list is empty. Paste at least one line first.' }); return }
    const res = await act.run(() => UsersApi.bulkCreate(rows), `Sent ${rows.length} line(s). Check the result for each line below.`)
    if (res) setResults(res)
  }
  return (
    <div className="card">
      <HowTo steps={[
        'Paste one line per person: first name, last name, username, email — split by commas.',
        'You can add a role and a temporary password at the end of a line. Both are optional.',
        'Click "Add all these users". Each line gets its own result — one bad line does not stop the rest.',
      ]} />
      <Note>
        Up to 1000 lines. Line format: <code>fname,lname,username,email[,role[,temporaryPassword]]</code>.
        Lines without a password get an invite email instead (a set-password link).
        For engineers: you can also paste a JSON list of full request objects.
      </Note>
      <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Alice,Hassan,alice.hassan,alice@example.com,RESEARCHER\nBotan,Karim,botan.karim,botan@example.com'} />
      <div className="row mt-2">
        <button onClick={submit} disabled={act.busy} title="POST /api/v1/admin/users/bulk">{act.busy ? 'Adding…' : 'Add all these users (extra password check)'}</button>
      </div>
      <Err e={act.err} /><Ok msg={act.ok} />
      {results && (
        <DataTable
          columns={[
            { key: 'index', label: 'Line' },
            { key: 'username', label: 'Username' },
            { key: 'email', label: 'Email' },
            { key: 'outcome', label: 'Result', render: (r) => <StatusBadge value={r.outcome} /> },
            { key: 'userId', label: 'Open', render: (r) => r.userId ? <Link to={`/users/${r.userId}`}>open user</Link> : null },
            { key: 'error', label: 'Problem (if any)' },
          ]}
          rows={results}
        />
      )}
    </div>
  )
}

function Invites() {
  const act = useAction()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('USER')
  const [invite, setInvite] = useState(null)
  const [manageId, setManageId] = useState('')

  return (
    <div>
      <div className="card">
        <h2>Send an invite</h2>
        <HowTo steps={[
          'Type the email address and pick a role.',
          'Click "Send the invite". The person gets an email with a join link.',
          'The link works for 7 days. The account is made when the person sets a password.',
          'Save the invite id from the reply below — you need it to resend or cancel later.',
        ]} />
        <div className="form-grid">
          <Field label="Email *"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Role"><Select value={role} onChange={(v) => setRole(v || 'USER')} options={ROLES} allowEmpty={false} /></Field>
          <button disabled={act.busy || !email} title="POST /api/v1/admin/users/invite" onClick={async () => {
            const res = await act.run(() => UsersApi.invite(email, role), 'Invite sent. Save the invite id shown below.')
            if (res) { setInvite(res); setManageId(res.id) }
          }}>Send the invite (extra password check)</button>
        </div>
        {invite && <JsonBlock v={invite} />}
      </div>
      <div className="card">
        <h2>Resend or cancel an invite</h2>
        <Note>
          There is no list of invites. Paste the invite id here. "Send the email again" also
          restarts the 7-day timer. "Cancel this invite" makes the link stop working.
        </Note>
        <div className="filters">
          <Field label="Invite id"><input value={manageId} onChange={(e) => setManageId(e.target.value)} className="w-id" /></Field>
          <button className="secondary" disabled={!manageId || act.busy} title="POST /api/v1/admin/users/invite/{id}/resend" onClick={async () => {
            const res = await act.run(() => UsersApi.inviteResend(manageId), 'Invite sent again. The link now works for 7 more days.')
            if (res) setInvite(res)
          }}>Send the email again</button>
          <button className="danger" disabled={!manageId || act.busy} title="DELETE /api/v1/admin/users/invite/{id}" onClick={() => act.run(() => UsersApi.inviteRevoke(manageId), 'Invite cancelled. The link no longer works.')}>Cancel this invite</button>
        </div>
      </div>
      <Err e={act.err} /><Ok msg={act.ok} />
    </div>
  )
}
