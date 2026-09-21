import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { AutoModModelApi } from '../../api'
import { useAuth } from '../../auth/AuthContext'
import { useLoad, useAction, fmtDate, fmtNum, short } from '../../util'
import { DataTable, Tiles, Modal, Confirm, KV, Badge, StatusBadge, Err, Ok, Note, Warn, Loading, PageIntro, HowTo } from '../../components/ui'
import { fmtScore, ScoreGrid } from '../../components/moderation'
import FormModal from '../../components/FormModal'

const PROMOTABLE = ['READY', 'SHADOW', 'RETIRED']
const st = (r) => String(r?.status || '').toUpperCase()

function flag(v, on, off) {
  if (v == null) return <span className="muted">—</span>
  return <Badge kind={v ? 'green' : 'err'}>{v ? on : off}</Badge>
}

export default function ModelRegistryPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const adminTip = isAdmin ? undefined : `Only ADMIN can do this (plus the extra password check). Your role is ${user?.role || 'unknown'}.`

  const { data, err, loading, reload } = useLoad(() => AutoModModelApi.versions(), [])
  const act = useAction()
  const [resp, setResp] = useState(null) // last mutation body — carries server note/warning
  const [retrainOpen, setRetrainOpen] = useState(false)
  const [rollbackOpen, setRollbackOpen] = useState(false)
  const [promoteRow, setPromoteRow] = useState(null)
  const [shadowRow, setShadowRow] = useState(null)

  const h = data?.health
  // ACTIVE first so the live artifact is never something you have to hunt for; newest training next.
  const rows = [...(data?.items || [])].sort((a, b) =>
    (st(a) === 'ACTIVE' ? 0 : 1) - (st(b) === 'ACTIVE' ? 0 : 1) ||
    String(b.trainedAt || '').localeCompare(String(a.trainedAt || '')))

  const after = (r, msg) => { setResp(r); act.setOk(msg); reload() }
  // A note/warning belongs to the call that produced it — drop it before the next one starts.
  const reset = () => { act.clear(); setResp(null) }
  // useAction.run() returns undefined only on error; a 204 legitimately resolves to null.
  const succeeded = (r) => r !== undefined

  return (
    <div>
      <PageIntro
        title="AI versions"
        lead="Train new AI versions, check their test results, start using one, or go back to an old one."
        bullets={[
          'You can start a new training run (retrain).',
          'You can see each version and whether it passed its test (gate).',
          'You can start using a version (promote).',
          'You can go back to the old version (rollback).',
          'You can test any text against the live AI.',
        ]}
      />
      <HowTo steps={[
        'Add examples first on the "Teach the AI" page.',
        'Click "Train a new version". Training runs in the background — this page just gets a new row.',
        'Wait for the row to say READY. Then read its test result (gate) and scores.',
        'Click "Start using…" (promote). You will get the extra password check.',
        'Watch the "AI health check" page for the next hour. If the numbers turn bad, click "Go back to the old version".',
      ]} />
      <Note>
        A training run never changes what the platform enforces by itself. Nothing changes until an ADMIN
        clicks "Start using". Every button here is ADMIN + the extra password check.
      </Note>
      {data?.warning && <Warn>{data.warning}</Warn>}
      {data?.note && <Note>{data.note}</Note>}
      <Err e={err} /><Loading on={loading} />

      <div className="card">
        <h2>AI computers</h2>
        <Tiles items={[
          { label: 'Scoring computer', value: flag(h?.inferenceUp, 'up', 'DOWN'), sub: `safety cut-out: ${h?.circuit ?? '—'}` },
          { label: 'Training computer', value: flag(h?.trainingUp, 'up', 'not started'), sub: 'started on demand only' },
          { label: 'Version running now', value: h?.residentVersion ?? '—', sub: 'what the computer actually serves' },
          { label: 'Version list says active', value: h?.activeVersion?.version ?? '—', sub: h?.activeVersion?.promotedAt ? `in use since ${fmtDate(h.activeVersion.promotedAt)}` : undefined },
          { label: 'Versions match', value: flag(h?.registryInSync, 'yes', 'MISMATCH') },
          { label: 'Average answer time', value: h?.avgLatencyMs == null ? '—' : `${fmtNum(Math.round(h.avgLatencyMs))} ms`, sub: `${h?.calls == null ? '—' : fmtNum(h.calls)} calls · ${h?.failures == null ? '—' : fmtNum(h.failures)} failed` },
          { label: 'Image scoring computer', value: flag(h?.imageInferenceUp, 'up', 'DOWN'), sub: `safety cut-out: ${h?.imageCircuit ?? '—'}` },
          { label: 'Image AI version', value: h?.imageModelVersion ?? '—', sub: 'fixed — the buttons on this page never touch it' },
        ]} />
        {h?.registryInSync === false && (
          <Warn>
            The version the AI computer is serving (<code>{h?.residentVersion ?? 'unknown'}</code>) is not the
            one the list calls active (<code>{h?.activeVersion?.version ?? 'unknown'}</code>). Fix it by
            promoting the version you want again — promoting reloads the computer first, then updates the list.
          </Warn>
        )}
      </div>

      <div className="filters">
        <button disabled={!isAdmin} title={adminTip} onClick={() => { reset(); setRetrainOpen(true) }}>Train a new version…</button>
        <button className="secondary" disabled={!isAdmin || act.busy}
          title={adminTip || 'Asks the training computer for progress right now, instead of waiting for the 15-second check.'}
          onClick={async () => {
            reset()
            const r = await act.run(() => AutoModModelApi.retrainRefresh(), 'Progress checked — no need to wait for the 15-second cycle.')
            if (succeeded(r)) { setResp(r); reload() }
          }}>
          Check training progress now
        </button>
        <button className="danger" disabled={!isAdmin} title={adminTip} onClick={() => { reset(); setRollbackOpen(true) }}>Go back to the old version…</button>
        <button className="secondary" onClick={reload}>Refresh the list</button>
      </div>
      {h?.trainingUp === false && (
        <Note>
          The training computer is off by default. A training run will refuse with
          <code> TRAINING_SERVICE_UNAVAILABLE</code> until an engineer runs
          <code> docker compose --profile on-demand up model-training</code> on the host.
        </Note>
      )}
      <Err e={act.err} /><Ok msg={act.ok} />
      {resp?.warning && <Warn>{resp.warning}</Warn>}
      {resp?.note && <Note>{resp.note}</Note>}

      <div className="card">
        <h2>All versions ({fmtNum(data?.totalElements) || rows.length})</h2>
        <Note>
          A version's life: TRAINING → EVALUATING → READY → (SHADOW) → ACTIVE → RETIRED. FAILED means the
          run itself broke. "Gate" is the automatic test every new version takes before it may be used.
        </Note>
        <DataTable
          columns={[
            {
              key: 'version', label: 'Version', render: (r) => (
                <div>
                  <strong>{r.version}</strong>{' '}
                  {st(r) === 'ACTIVE' && <Badge kind="green">in use now</Badge>}
                  {r.jobId ? <div className="code-xs">job {short(r.jobId)}</div> : null}
                </div>
              )
            },
            { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
            {
              key: 'gatePassed', label: 'Test (gate)', render: (r) => r.gatePassed == null
                ? <span className="muted">—</span>
                : (
                  <div title={r.gateDetail || undefined}>
                    <Badge kind={r.gatePassed ? 'green' : 'err'}>{r.gatePassed ? 'passed' : 'FAILED'}</Badge>
                    {r.gateDetail ? <div className="footnote">{r.gateDetail}</div> : null}
                  </div>
                )
            },
            { key: 'macroF1', label: 'Quality score (macro F1)', render: (r) => <span className="mono">{fmtScore(r.macroF1)}</span> },
            { key: 'trainingExamples', label: 'Examples used', render: (r) => <span className="mono">{fmtNum(r.trainingExamples) || '—'}</span> },
            { key: 'validationCount', label: 'Test examples', render: (r) => <span className="mono">{fmtNum(r.validationCount) || '—'}</span> },
            { key: 'baseCheckpoint', label: 'Built from' },
            { key: 'trainedAt', label: 'Started' },
            { key: 'completedAt', label: 'Finished' },
            { key: 'promotedAt', label: 'In use since' },
            { key: 'error', label: 'Error', render: (r) => r.error ? <Badge kind="err">{r.error}</Badge> : <span className="muted">—</span> },
            { key: 'artifactPath', label: 'File path', render: (r) => r.artifactPath ? <code>{r.artifactPath}</code> : <span className="muted">—</span> },
            { key: 'notes', label: 'Notes' },
            {
              key: '_', label: 'Actions', render: (r) => {
                const promotable = PROMOTABLE.includes(st(r))
                const alreadyShadow = st(r) === 'SHADOW'
                return (
                  <span className="row-actions">
                    <button className="small" disabled={!isAdmin || !promotable}
                      title={adminTip || (promotable ? undefined : 'Only a READY, SHADOW or RETIRED version can be put in use.')}
                      onClick={() => { reset(); setPromoteRow(r) }}>Start using…</button>
                    <button className="small secondary" disabled={!isAdmin || alreadyShadow}
                      title={adminTip || (alreadyShadow ? 'Already marked SHADOW.' : undefined)}
                      onClick={() => { reset(); setShadowRow(r) }}>Watch only (shadow)…</button>
                  </span>
                )
              }
            },
          ]}
          rows={rows}
          loading={loading}
          empty="No AI versions yet — nothing has been trained."
        />
      </div>

      <div className="card">
        <h2>After you start using a new version — watch list</h2>
        <ul className="muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
          <li>Reload this page: "Versions match" must say yes, and "Version running now" must be the one you picked.</li>
          <li>Watch "Decided by AI alone" and "Waiting for a person" for the next hour — a new version that quietly doubles the review pile is exactly the failure the test cannot catch. <Link to="/moderation/health">→ AI health check</Link></li>
          <li>If the numbers turn bad, go back. Every version file is kept, so going back costs nothing but a reload.</li>
        </ul>
      </div>

      <ProbeBox />

      {retrainOpen && (
        <FormModal title="Train a new AI version"
          intro="Train when there is a good batch of new examples — the 'not trained yet' number on the health page is the sign; around fifty is worth it. The server may refuse: TRAINING_ALREADY_RUNNING (a run is going), TRAINING_DATASET_TOO_SMALL (too few examples), TRAINING_SERVICE_UNAVAILABLE (the training computer is off). The call returns at once; training then runs in the background."
          fields={[
            { name: 'baseVersion', label: 'Build from version', placeholder: 'v3', help: 'Optional. Leave blank to build from the version in use now.' },
            { name: 'notes', label: 'Notes', type: 'textarea', help: 'Why this run exists. It stays on the version row — the only context a later person gets.' },
          ]}
          submitLabel="Start training (extra password check)"
          onSubmit={async (v) => {
            const r = await AutoModModelApi.retrain({ baseVersion: v.baseVersion, notes: v.notes })
            after(r, `Training started${r?.version ? ` — ${r.version} is queued` : ''}. Watch its row on this page.`)
          }}
          onClose={() => setRetrainOpen(false)} />
      )}

      {rollbackOpen && (
        <FormModal title="Go back to the old version" danger requireText="ROLLBACK"
          intro="This puts the most recently retired version back in use. Every version file is kept, so this never needs re-training. Use it when a new version turned out worse in ways the test missed. Like any switch, it reloads the AI computer first, then updates the list."
          fields={[]}
          submitLabel="Go back now (extra password check)"
          onSubmit={async () => {
            const r = await AutoModModelApi.rollback()
            after(r, `Went back${r?.version ? ` to ${r.version}` : ''}.`)
          }}
          onClose={() => setRollbackOpen(false)} />
      )}

      {promoteRow && (
        <PromoteDialog row={promoteRow} busy={act.busy} err={act.err}
          onConfirm={async (force) => {
            const r = await act.run(() => AutoModModelApi.promote(promoteRow.id, force), `${promoteRow.version} is now in use — check "Version running now" above.`)
            if (succeeded(r)) { setResp(r); setPromoteRow(null); reload() }
          }}
          onClose={() => setPromoteRow(null)} />
      )}

      {shadowRow && (
        <Confirm title={`Mark ${shadowRow.version} as watch-only (SHADOW)`} danger={false} confirmLabel="Mark SHADOW"
          busy={act.busy}
          message={
            <>
              <p className="modal-lead">
                This only records a status. SHADOW means "score live traffic but do not enforce" — but the
                second scoring computer that would do that is <strong>not set up</strong>. So marking this
                version SHADOW starts nothing, and no shadow numbers will appear anywhere.
              </p>
              <p className="muted">The only real effect: the version stays ready to be put in use while it sits here.</p>
              <Err e={act.err} />
            </>
          }
          onConfirm={async () => {
            const r = await act.run(() => AutoModModelApi.shadow(shadowRow.id), `${shadowRow.version} marked SHADOW (a status only).`)
            if (succeeded(r)) { setResp(r); setShadowRow(null); reload() }
          }}
          onClose={() => setShadowRow(null)} />
      )}
    </div>
  )
}

/** Score any text against the live model — same probe as on "Teach the AI", repeated here so a
    just-promoted version can be sanity-checked without leaving the page. */
function ProbeBox() {
  const [text, setText] = useState('')
  const act = useAction()
  const [res, setRes] = useState(null)

  return (
    <div className="card">
      <h2>Test some text against the live AI</h2>
      <Note>
        Quick check after switching versions: paste a sentence and see the scores the live AI gives right
        now. Nothing is saved. The same box is on the <Link to="/moderation/dataset">Teach the AI</Link> page.
      </Note>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the text you want scored…" />
      <div className="row mt-2">
        <button disabled={!text.trim() || act.busy} onClick={async () => {
          setRes(null)
          const r = await act.run(() => AutoModModelApi.scoreProbe(text))
          if (r) setRes(r)
        }}>{act.busy ? 'Scoring…' : 'Score this text'}</button>
      </div>
      <Err e={act.err} />
      {res?.note && <Note>{res.note}</Note>}
      {res?.warning && <Warn>{res.warning}</Warn>}
      {res && (
        <div className="mt-2">
          <div className="row" style={{ gap: 14 }}>
            <span>AI version <code>{res.modelVersion ?? '—'}</code></span>
            <span className="muted mono">{res.inferenceMs != null ? `${res.inferenceMs} ms` : '—'}</span>
          </div>
          <ScoreGrid scores={res.scores} />
        </div>
      )}
    </div>
  )
}

/**
 * Hand-rolled rather than a FormModal because a failed gate has to be argued in a full <Warn> block,
 * and FormModal's intro is a single paragraph.
 */
function PromoteDialog({ row, busy, err, onConfirm, onClose }) {
  const [force, setForce] = useState(false)
  const [typed, setTyped] = useState('')
  const gateFailed = row.gatePassed === false
  const blocked = typed !== 'PROMOTE' || (gateFailed && !force) || busy

  return (
    <Modal title={`Start using ${row.version}`} onClose={onClose} wide>
      <p className="modal-lead">
        The switch reloads the AI computer <strong>first</strong>, and only then updates the version list.
        So a broken version leaves the running AI untouched, and the list never claims something is live
        when it is not. The server may refuse: <code>MODEL_NOT_PROMOTABLE</code> (wrong status) or{' '}
        <code>MODEL_GATE_FAILED</code> (the test failed and you did not force it).
      </p>
      <KV obj={{
        status: row.status,
        gatePassed: row.gatePassed,
        gateDetail: row.gateDetail,
        macroF1: fmtScore(row.macroF1),
        validationCount: row.validationCount,
        baseCheckpoint: row.baseCheckpoint,
        artifactPath: row.artifactPath,
      }} />
      <p className="muted">
        The test (gate) fails when any golden test case fails, or when any label got worse by more than{' '}
        <code>retrain.max-f1-drop</code> (default 0.02) compared with the version in use. A version whose
        test failed is still READY, not FAILED — the numbers above are the evidence, and a person decides.
      </p>
      <label className="field mt-2">
        <span>Force past the failed test{gateFailed ? ' (required — this version failed its test)' : ''}</span>
        <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
      </label>
      {gateFailed && (
        <Warn>
          This version did not pass its test. Forcing past it is written into the action history under your
          user id, together with the test detail above — the thing you chose to ignore.
        </Warn>
      )}
      <Err e={err} />
      <label className="field mt-2">
        <span>Type <code>PROMOTE</code> to confirm — this changes what the platform enforces</span>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="PROMOTE" />
      </label>
      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>Cancel</button>
        <button className="danger" disabled={blocked} onClick={() => onConfirm(force)}>{busy ? 'Working…' : 'Start using it (extra password check)'}</button>
      </div>
    </Modal>
  )
}
