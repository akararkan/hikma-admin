import React, { useEffect, useMemo, useState } from 'react'
import { AutoModSettingsApi } from '../../api'
import { useLoad, useAction, fmtNum } from '../../util'
import { DataTable, Tiles, Err, Ok, Note, Warn, Loading, Field, Select, Badge, KV, Confirm, PageIntro, HowTo, Id } from '../../components/ui'
import FormModal from '../../components/FormModal'
import { LABELS, STRICT_LABELS, ENTITY_TYPES, FALLBACKS, fmtScore, ScoreMeter, BandLegend, VerdictBadge } from '../../components/moderation'
import { useAuth } from '../../auth/AuthContext'

const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v))
const str = (v) => (v === null || v === undefined ? '' : String(v))
const yesNo = (v) => (v === true ? 'yes' : v === false ? 'no' : '—')
const upper = (v) => String(v || '').toUpperCase()
const FALSEY = new Set(['false', 'off', 'no', '0'])

/** Baseline a "loosening" is judged against when the effective edge is unknown — without it the
    strict-label warning silently disappears exactly when the current band failed to load. */
const STRICT_DEFAULTS = { threat: { low: 0.15, high: 0.50 }, identity_hate: { low: 0.15, high: 0.55 } }

/** Server prose is contract: anything that ships a note/warning renders it verbatim. */
function ServerMsgs({ r }) {
  if (!r || typeof r !== 'object') return null
  return <>{r.note ? <Note>{r.note}</Note> : null}{r.warning ? <Warn>{r.warning}</Warn> : null}</>
}

const edgeText = (r) => ['low', 'high']
  .filter((e) => r.edges[e] !== undefined)
  .map((e) => `${e} ${fmtScore(r.cur[e])}→${fmtScore(r.edges[e])}`)

/** Take whichever level of the thresholds payload actually carries the six label keys. */
function bandsFrom(d) {
  if (!d || typeof d !== 'object') return null
  if (LABELS.some((l) => d[l] && typeof d[l] === 'object')) return d
  for (const v of Object.values(d)) {
    if (v && typeof v === 'object' && LABELS.some((l) => v[l] && typeof v[l] === 'object')) return v
  }
  return null
}

export default function ModerationSettingsPage() {
  const { user } = useAuth()
  const canWrite = user?.role === 'ADMIN' || user?.role === 'MODERATOR'
  const isAdmin = user?.role === 'ADMIN'
  const writeTip = canWrite ? undefined : `You need the ADMIN or MODERATOR role. Your role is ${user?.role || 'unknown'}.`
  const adminTip = isAdmin ? undefined : `Only ADMIN can do this. Your role is ${user?.role || 'unknown'}.`

  const { data, err, loading, reload } = useLoad(() => AutoModSettingsApi.settings(), [])
  const [scope, setScope] = useState(undefined) // undefined = the global default
  const toggleAct = useAction()
  const [toggleRow, setToggleRow] = useState(null) // row waiting for the "turn off" confirm

  const eff = data?.effective || {}
  const typeRows = useMemo(
    () => Object.entries(eff.entityTypes || {}).map(([type, v]) => ({ type, ...(v || {}) })),
    [eff.entityTypes],
  )

  const setTypeEnabled = async (type, enabled) => {
    const r = await toggleAct.run(() => AutoModSettingsApi.putHoldDurations({ entityType: type, enabled }),
      enabled ? `AI checks are ON again for ${type}.` : `AI checks are OFF for ${type}. The blocked-words list still works there.`)
    if (r !== undefined) { setToggleRow(null); reload() }
  }

  return (
    <div>
      <PageIntro
        title="AI rules"
        lead="Set how strict the AI is, and turn it on or off for each kind of content."
        bullets={[
          'You can change the score limits (thresholds) for each label.',
          'You can run a safe test (dry-run) first. It changes nothing.',
          'You can set how long a post may wait, and what happens if time runs out.',
          'You can turn AI checks on or off for each content type.',
          'You can set the rules for image checks (nudity filter) — admin only.',
          'You can set raw override keys and reset everything (admin only).',
        ]}
      />
      <HowTo steps={[
        'Pick a content type in "Score limits", or leave it on "(all types)" for the default.',
        'Type new low/high numbers only for the labels you want to change.',
        'Click "Run the safe test". It shows which past decisions would change. Nothing is saved.',
        'Read the result. If it looks right, click "Save the new limits".',
        'To turn a content type on or off, use the buttons in the table below.',
      ]} />
      <Note>
        This page shows what is <strong>really being enforced right now</strong> (the "effective" settings).
        A saved change is live within 30 seconds on every server.
      </Note>
      <div className="toolbar">
        <button className="secondary" onClick={reload}>Refresh the list</button>
      </div>
      <Err e={err} /><Loading on={loading} />
      <ServerMsgs r={data} />

      {data && (
        <div className="card">
          <h2>What is in force now</h2>
          <div className="toolbar">
            <Badge kind={eff.enabled ? 'green' : 'err'}>
              {eff.enabled ? 'AI CHECKS ARE ON' : 'AI CHECKS ARE OFF'}
            </Badge>
            <span className="muted">
              {Object.keys(data.overrides || {}).length} setting(s) changed from the starting values
            </span>
          </div>
          {eff.enabled === false && (
            <Warn>AI checks are off for the whole platform. The blocked-words list still works; nothing else is checked.</Warn>
          )}
          <Tiles items={[
            { label: 'Live chat delay', value: eff['livechat.buffer.ms'] == null ? '—' : `${fmtNum(eff['livechat.buffer.ms'])} ms`, sub: 'livechat.buffer.ms' },
            { label: 'Hide unsure live chat', value: yesNo(eff['livechat.borderline.hidden']), sub: 'livechat.borderline.hidden' },
            { label: 'Quality gate for new versions', value: eff['retrain.max-f1-drop'] == null ? '—' : fmtScore(eff['retrain.max-f1-drop']), sub: 'retrain.max-f1-drop' },
            { label: 'A person must start new versions', value: yesNo(eff['retrain.require-human-promote']), sub: 'retrain.require-human-promote' },
          ]} />
          {data.model && (<><h4>AI version in force</h4><KV obj={data.model} /></>)}
        </div>
      )}

      <div className="card">
        <h2>Rules for each content type</h2>
        <Note>
          Click a row to point both editors below at that content type. The "Turn off" button stops AI
          checks for that type only — the blocked-words list keeps working, held posts stay in the queue,
          and old posts are not re-checked when you turn it back on.
          Images are <strong>not</strong> in this table on purpose — the word limits below do not apply to
          pictures. Image rules have their own card, "Image checks", further down.
        </Note>
        <Err e={toggleAct.err} /><Ok msg={toggleAct.ok} />
        <DataTable
          columns={[
            {
              key: 'type', label: 'Content type', render: (r) => (
                <span className="row snug">
                  <strong>{r.type}</strong>
                  {scope === r.type ? <span className="muted">editing ↓</span> : null}
                </span>
              )
            },
            { key: 'enabled', label: 'AI checks', render: (r) => r.enabled == null ? <span className="muted">—</span> : <Badge kind={r.enabled ? 'green' : 'err'}>{r.enabled ? 'on' : 'off'}</Badge> },
            { key: 'holdMs', label: 'Longest wait (holdMs)', render: (r) => r.holdMs == null ? <span className="muted">—</span> : <span className="mono">{fmtNum(r.holdMs)}</span> },
            { key: 'inlineMs', label: 'Instant budget (inlineMs)', render: (r) => r.inlineMs == null ? <span className="muted">—</span> : <span className="mono">{fmtNum(r.inlineMs)}</span> },
            { key: 'fallback', label: 'If time runs out', render: (r) => r.fallback ? <Badge kind={r.fallback === 'FAIL_CLOSED' ? 'blue' : 'red'}>{r.fallback}</Badge> : <span className="muted">—</span> },
            { key: 'ephemeral', label: 'Short-lived' },
            {
              key: '_toggle', label: 'Turn on / off', render: (r) => (
                <span onClick={(e) => e.stopPropagation()}>
                  {r.enabled === false
                    ? <button className="small" disabled={!canWrite || toggleAct.busy} title={writeTip}
                        onClick={() => setTypeEnabled(r.type, true)}>Turn on</button>
                    : <button className="small danger" disabled={!canWrite || toggleAct.busy} title={writeTip}
                        onClick={() => { toggleAct.clear(); setToggleRow(r) }}>Turn off…</button>}
                </span>
              )
            },
          ]}
          rows={typeRows}
          rowKey={(r) => r.type}
          onRow={(r) => setScope(r.type)}
          loading={loading}
          empty="The server sent no per-type rules."
        />
      </div>

      {toggleRow && (
        <Confirm
          title={`Turn off AI checks for ${toggleRow.type}`}
          message={<>
            <p className="modal-lead">
              New {toggleRow.type} content will publish with no AI check. The blocked-words list still works.
              Posts already held stay held — this does not release them. Nothing is re-checked when you turn it back on.
            </p>
            <Err e={toggleAct.err} />
          </>}
          requireText="OFF"
          confirmLabel="Turn off (extra password check)"
          danger
          busy={toggleAct.busy}
          onConfirm={() => setTypeEnabled(toggleRow.type, false)}
          onClose={() => setToggleRow(null)}
        />
      )}

      <ThresholdEditor scope={scope} setScope={setScope} effective={eff} canWrite={canWrite} writeTip={writeTip} onSaved={reload} />
      <HoldDurations scope={scope} setScope={setScope} effective={eff} canWrite={canWrite} writeTip={writeTip} onSaved={reload} />
      <ImageRules image={eff.image} globalEnabled={eff.enabled} isAdmin={isAdmin} adminTip={adminTip} onSaved={reload} loading={loading} />
      <RawOverrides overrides={data?.overrides} isAdmin={isAdmin} adminTip={adminTip} onChanged={reload} loading={loading} />
    </div>
  )
}

function ThresholdEditor({ scope, setScope, effective, canWrite, writeTip, onSaved }) {
  const act = useAction()
  const remote = useLoad(() => AutoModSettingsApi.thresholds(scope), [scope])
  const typeBands = scope ? effective?.entityTypes?.[scope]?.thresholds : null
  const current = useMemo(() => bandsFrom(remote.data) || typeBands || {}, [remote.data, typeBands])

  const [prop, setProp] = useState({})
  const [replayType, setReplayType] = useState(undefined)
  const [caseText, setCaseText] = useState('')
  const [dry, setDry] = useState(null) // {key, res} — keyed so any edit invalidates it
  const [confirm, setConfirm] = useState(false)
  const [resp, setResp] = useState(null)

  const currentKey = JSON.stringify(current)
  useEffect(() => {
    const b = JSON.parse(currentKey)
    setProp(Object.fromEntries(LABELS.map((l) => [l, { low: str(b[l]?.low), high: str(b[l]?.high) }])))
    setDry(null)
    // `scope` is a dep on purpose: two scopes can carry byte-identical bands, and without it the
    // previous scope's edits would silently ride across the switch.
  }, [currentKey, scope])

  const setEdge = (l, edge, v) => setProp((s) => ({ ...s, [l]: { ...(s[l] || { low: '', high: '' }), [edge]: v } }))

  const rows = LABELS.map((l) => {
    const cur = current[l] || {}
    const p = prop[l] || { low: '', high: '' }
    const lowIn = p.low === '' ? undefined : Number(p.low)
    const highIn = p.high === '' ? undefined : Number(p.high)
    const edges = {}
    if (lowIn !== undefined && lowIn !== num(cur.low)) edges.low = lowIn
    if (highIn !== undefined && highIn !== num(cur.high)) edges.high = highIn
    const changed = Object.keys(edges).length > 0
    // A blank edge keeps whatever is in force, so the band drawn is always the whole proposed band.
    const merged = { low: lowIn ?? num(cur.low), high: highIn ?? num(cur.high) }
    const bad = changed && !(Number.isFinite(merged.low) && Number.isFinite(merged.high)
      && merged.low >= 0 && merged.high <= 1 && merged.high >= merged.low)
    const base = STRICT_DEFAULTS[l] || {}
    const cmpLow = Number.isFinite(num(cur.low)) ? num(cur.low) : base.low
    const cmpHigh = Number.isFinite(num(cur.high)) ? num(cur.high) : base.high
    const loosened = changed && STRICT_LABELS.has(l)
      && ((edges.low !== undefined && edges.low > cmpLow) || (edges.high !== undefined && edges.high > cmpHigh))
    return { label: l, cur, p, edges, changed, merged, bad, loosened }
  })

  const patch = Object.fromEntries(rows.filter((r) => r.changed).map((r) => [r.label, r.edges]))
  const nChanged = Object.keys(patch).length
  const anyBad = rows.some((r) => r.bad)
  const loosenedLabels = rows.filter((r) => r.loosened).map((r) => r.label)
  const caseIds = caseText.split(/\n+/).map((s) => s.trim()).filter(Boolean)

  const target = scope || replayType
  const dryKey = JSON.stringify({ target, patch, caseIds })
  const fresh = !!dry && dry.key === dryKey
  const changedCases = dry?.res?.changed || []

  // Needle = the worst real score the replay surfaced for that label; a band edge means nothing
  // without a case sitting near it.
  const probe = useMemo(() => {
    const m = {}
    for (const c of dry?.res?.changed || []) {
      const s = Number(c?.topScore)
      if (c?.topLabel && Number.isFinite(s)) m[c.topLabel] = Math.max(m[c.topLabel] ?? 0, s)
    }
    return m
  }, [dry])

  const rank = { APPROVE: 0, REVIEW: 1, REJECT: 2 }
  const newlyPublish = changedCases.filter((c) => upper(c.after) === 'APPROVE' && upper(c.before) !== 'APPROVE').length
  const newlyHeld = changedCases.filter((c) => upper(c.after) !== 'APPROVE' && upper(c.before) === 'APPROVE').length
  const shifted = changedCases.filter((c) => rank[upper(c.before)] > 0 && rank[upper(c.after)] > 0 && c.before !== c.after).length

  const dryBlock = !canWrite ? writeTip
    : nChanged === 0 ? 'Change at least one limit first'
      : anyBad ? 'Fix the red limits first'
        : !target ? 'Pick a content type to test the change against'
          : undefined
  const saveBlock = dryBlock || (!fresh ? 'Run the safe test for this exact change first' : undefined)

  const runDry = async () => {
    const res = await act.run(
      () => AutoModSettingsApi.dryRun({ entityType: target, labels: patch, caseIds: caseIds.length ? caseIds : undefined }),
      'Safe test done — nothing was saved, no AI was called.',
    )
    if (res) setDry({ key: dryKey, res })
  }

  const summary = rows.filter((r) => r.changed).map((r) => `${r.label} ${edgeText(r).join(', ')}`).join(' · ')

  return (
    <div className="card">
      <h2>Score limits (thresholds)</h2>
      <Note>
        Each label has two limits. Below <code>low</code> the AI approves alone. Between <code>low</code> and{' '}
        <code>high</code> a person must look. At or above <code>high</code> the AI blocks alone. A limit set
        for one content type wins over the default. A limit you leave blank stays as it is.
      </Note>
      <BandLegend />
      <div className="filters">
        <Field label="Which content type">
          <Select value={scope} onChange={setScope} options={ENTITY_TYPES} emptyLabel="(all types — the default)" />
        </Field>
        {!scope && (
          <Field label="Test the change against">
            <Select value={replayType} onChange={setReplayType} options={ENTITY_TYPES} emptyLabel="(pick a type)" />
          </Field>
        )}
        <button className="secondary" onClick={remote.reload}>Refresh the list</button>
      </div>
      {!scope && (
        <Note>
          You are editing the default for all types. The safe test replays one content type at a time —
          pick the type whose traffic you want to sample.
        </Note>
      )}
      <Err e={remote.err} /><Loading on={remote.loading} />

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Label and the new limits drawn</th>
              <th>In force now</th>
              <th>New low</th>
              <th>New high</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td style={{ minWidth: 440 }}><ScoreMeter label={r.label} score={probe[r.label]} band={r.merged} /></td>
                <td className="mono">{Number.isFinite(num(r.cur.low)) ? `${fmtScore(r.cur.low)} / ${fmtScore(r.cur.high)}` : <span className="muted">no limits</span>}</td>
                {/* Locked while the per-type limits are still loading: the reseed effect
                    would silently wipe anything typed against the not-yet-loaded scope. */}
                <td><input type="number" step="0.01" min="0" max="1" disabled={remote.loading} value={r.p.low} onChange={(e) => setEdge(r.label, 'low', e.target.value)} className="w-num" /></td>
                <td><input type="number" step="0.01" min="0" max="1" disabled={remote.loading} value={r.p.high} onChange={(e) => setEdge(r.label, 'high', e.target.value)} className="w-num" /></td>
                <td>
                  {r.bad ? <Badge kind="err">must be 0 ≤ low ≤ high ≤ 1</Badge>
                    : r.changed ? <span className="mono">{edgeText(r).join(' · ')}</span>
                      : <span className="muted">unchanged</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {loosenedLabels.length > 0 && (
        <Warn>
          You are making a strict label softer: {loosenedLabels.join(', ')}. These labels start lower than
          the rest (threat 0.15/0.50, identity_hate 0.15/0.55) because missing a real threat costs far more
          than a false alarm. Read the safe test's "would newly publish" count before you save.
        </Warn>
      )}

      <h4>Safe test (dry-run) — required before saving</h4>
      <Note>
        The safe test replays your new limits against real stored scores from past cases. It shows exactly
        which past decisions would flip. It saves nothing and calls no AI. Any edit to the limits, the type
        or the case list makes the test out of date, and Save locks again.
      </Note>
      <div className="field" style={{ maxWidth: 420 }}>
        <span>Only test these case ids (one per line — optional)</span>
        <textarea value={caseText} onChange={(e) => setCaseText(e.target.value)} placeholder="leave empty to test all stored cases for this type" />
      </div>
      <div className="row mt-2">
        <button className="secondary" disabled={!!dryBlock || act.busy} title={dryBlock} onClick={runDry}>Run the safe test {caseIds.length ? `(${caseIds.length} case ids)` : ''}</button>
        <button disabled={!!saveBlock || act.busy} title={saveBlock} onClick={() => setConfirm(true)}>Save the new limits… (extra password check)</button>
        <span className="muted">{nChanged} label limit(s) changed</span>
      </div>
      <Err e={act.err} /><Ok msg={act.ok} /><ServerMsgs r={resp} />

      {dry && !fresh && <Warn>You changed something after this safe test — run it again before saving.</Warn>}
      {dry && (
        <>
          <ServerMsgs r={dry.res} />
          <Tiles items={[
            { label: 'Cases tested', value: dry.res?.evaluated == null ? '—' : fmtNum(dry.res.evaluated), sub: dry.res?.entityType || target },
            { label: 'Stay the same', value: dry.res?.unchanged == null ? '—' : fmtNum(dry.res.unchanged) },
            { label: 'Would change', value: fmtNum(changedCases.length) },
          ]} />
          <Note>
            {fmtNum(newlyPublish)} would newly publish, {fmtNum(newlyHeld)} would newly be held or blocked
            {shifted ? `, ${fmtNum(shifted)} move between review and block` : ''}.
          </Note>
          <DataTable
            columns={[
              { key: 'caseId', label: 'Case', render: (r) => <Id v={r.caseId} /> },
              { key: 'field', label: 'Field' },
              { key: 'before', label: 'Before → after', render: (r) => <span className="row snug"><VerdictBadge value={r.before} /><span className="muted">→</span><VerdictBadge value={r.after} /></span> },
              { key: 'topLabel', label: 'Top label' },
              { key: 'topScore', label: 'Top score', render: (r) => <span className="mono">{fmtScore(r.topScore)}</span> },
            ]}
            rows={changedCases}
            rowKey={(r) => `${r.caseId}:${r.field}`}
            empty="No tested case changes its verdict under these limits."
          />
        </>
      )}

      {confirm && (
        <FormModal
          title={`Save the new limits — ${scope || 'default for all types'}`}
          danger={loosenedLabels.length > 0}
          requireText={loosenedLabels.length > 0 ? 'LOOSEN' : undefined}
          intro={`${summary}. ${loosenedLabels.length ? `This makes strict label(s) softer: ${loosenedLabels.join(', ')}. ` : ''}Only the limits you changed are sent. Live within 30 seconds on every server.`}
          fields={[]}
          submitLabel="Save the new limits (extra password check)"
          onSubmit={async () => {
            const body = { labels: patch }
            if (scope) body.entityType = scope
            const r = await AutoModSettingsApi.putThresholds(body)
            setResp(r)
            act.setOk('The new limits are saved and live.')
            setDry(null)
            remote.reload()
            onSaved()
          }}
          onClose={() => setConfirm(false)}
        />
      )}
    </div>
  )
}

const EMPTY_HOLD = { holdMs: '', inlineMs: '', fallback: undefined, enabled: undefined }

function HoldDurations({ scope, setScope, effective, canWrite, writeTip, onSaved }) {
  const act = useAction()
  const cur = scope ? effective?.entityTypes?.[scope] : null
  const [f, setF] = useState(EMPTY_HOLD)
  const [confirmDisable, setConfirmDisable] = useState(false)
  const [resp, setResp] = useState(null)
  useEffect(() => { setF(EMPTY_HOLD) }, [scope])

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const holdMs = f.holdMs === '' ? undefined : Number(f.holdMs)
  const inlineMs = f.inlineMs === '' ? undefined : Number(f.inlineMs)
  const holdBad = holdMs !== undefined && !(Number.isFinite(holdMs) && holdMs >= 500 && holdMs <= 600000)
  const inlineBad = inlineMs !== undefined && !(Number.isFinite(inlineMs) && inlineMs >= 0)

  const patch = {}
  if (holdMs !== undefined) patch.holdMs = holdMs
  if (inlineMs !== undefined) patch.inlineMs = inlineMs
  if (f.fallback) patch.fallback = f.fallback
  if (f.enabled !== undefined) patch.enabled = f.enabled === 'true'
  const nFields = Object.keys(patch).length

  const effHold = holdMs ?? num(cur?.holdMs)
  const willClamp = inlineMs !== undefined && Number.isFinite(effHold) && inlineMs * 2 >= effHold
  const disabling = patch.enabled === false

  const block = !canWrite ? writeTip
    : nFields === 0 ? 'Nothing to save — change at least one field'
      : holdBad ? 'The longest wait must be between 500 and 600000 ms'
        : inlineBad ? 'The instant budget must be 0 or more'
          : undefined

  const apply = async () => {
    const body = { ...patch }
    if (scope) body.entityType = scope
    const r = await act.run(() => AutoModSettingsApi.putHoldDurations(body), 'Wait-time rules saved.')
    if (r !== undefined) {
      setResp(r)
      setF(EMPTY_HOLD)
      setConfirmDisable(false)
      onSaved()
    }
  }

  return (
    <div className="card">
      <h2>Wait time and what happens when it runs out</h2>
      <Note>
        <code>holdMs</code> is the LONGEST possible wait, not a delay — clean content clears in under a
        second. The ceiling exists so a slow or failed check always has a clear ending.
        FAIL_CLOSED = stay hidden and wait for a person (the safe default).
        FAIL_OPEN_SHADOW = publish now and flag for review — only for short-lived things like stories,
        because a 24-hour story stuck in a queue is as good as deleted.
      </Note>
      <div className="filters">
        <Field label="Which content type">
          <Select value={scope} onChange={setScope} options={ENTITY_TYPES} emptyLabel="(all types — the default)" />
        </Field>
        <Field label="Longest wait, ms (500–600000)">
          <input type="number" min={500} max={600000} value={f.holdMs} onChange={(e) => set('holdMs', e.target.value)}
            placeholder={cur?.holdMs != null ? `now ${cur.holdMs}` : 'blank = keep as is'} />
        </Field>
        <Field label="Instant budget, ms (inlineMs)">
          <input type="number" min={0} value={f.inlineMs} onChange={(e) => set('inlineMs', e.target.value)}
            placeholder={cur?.inlineMs != null ? `now ${cur.inlineMs}` : 'blank = keep as is'} />
        </Field>
        <Field label="If time runs out">
          <Select value={f.fallback} onChange={(v) => set('fallback', v)} options={FALLBACKS} emptyLabel="(keep as is)" />
        </Field>
        <Field label="AI checks">
          <Select value={f.enabled} onChange={(v) => set('enabled', v)}
            options={[{ value: 'true', label: 'on' }, { value: 'false', label: 'off' }]} emptyLabel="(keep as is)" />
        </Field>
        <button disabled={!!block || act.busy} title={block} onClick={() => (disabling ? setConfirmDisable(true) : apply())}>
          Save (extra password check)
        </button>
      </div>
      {holdBad && <Warn>The longest wait must be between 500 and 600000 ms — the server refuses anything else.</Warn>}
      {willClamp && (
        <Warn>
          The instant budget is at or above half of the longest wait ({fmtNum(effHold)} ms). The server will
          lower it for you, so the saved value will not be the one you typed.
        </Warn>
      )}
      <Err e={act.err} /><Ok msg={act.ok} /><ServerMsgs r={resp} />
      {confirmDisable && (
        <Confirm
          title={scope ? `Turn off AI checks for ${scope}` : 'Turn off AI checks for the whole platform'}
          message={<>
            <p className="modal-lead">{scope
              ? `New ${scope} content will publish with no AI check. The blocked-words list still works there.`
              : 'This is the big off switch: the AI stops checking everything, everywhere. The blocked-words list still works. Nothing else is checked until you turn it back on.'}</p>
            <Err e={act.err} />
          </>}
          requireText="DISABLE"
          confirmLabel="Turn off (extra password check)"
          danger
          busy={act.busy}
          onConfirm={apply}
          onClose={() => setConfirmDisable(false)}
        />
      )}
    </div>
  )
}

const EMPTY_IMAGE = { enabled: undefined, block: '', review: '', fallback: undefined, videoPosters: undefined }

/**
 * The NSFW image gate (`image.*` keys). It has no endpoint of its own — every write rides the raw
 * settings key surface, which is ADMIN-only, so this whole editor is ADMIN even though the text
 * editors above allow MODERATOR.
 */
function ImageRules({ image, globalEnabled, isAdmin, adminTip, onSaved, loading }) {
  const act = useAction()
  const [f, setF] = useState(EMPTY_IMAGE)
  const [confirmOff, setConfirmOff] = useState(false)
  const [resp, setResp] = useState(null)

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const block = f.block === '' ? undefined : Number(f.block)
  const review = f.review === '' ? undefined : Number(f.review)
  const badRange = (v) => v !== undefined && !(Number.isFinite(v) && v >= 0 && v <= 1)
  const blockBad = badRange(block)
  const reviewBad = badRange(review)

  // [key, value] pairs — only what was actually changed is written.
  const changes = []
  if (f.enabled !== undefined) changes.push(['image.enabled', f.enabled])
  if (block !== undefined) changes.push(['image.threshold.block', String(block)])
  if (review !== undefined) changes.push(['image.threshold.review', String(review)])
  if (f.fallback) changes.push(['image.fallback', f.fallback])
  if (f.videoPosters !== undefined) changes.push(['image.video-posters', f.videoPosters])

  const disabling = f.enabled === 'false'
  const effBlock = block ?? num(image?.blockThreshold)
  const effReview = review ?? num(image?.reviewThreshold)
  // Lowering block below the standing review limit clamps too — not only a typed review value.
  const willClamp = (review !== undefined || block !== undefined)
    && Number.isFinite(effBlock) && Number.isFinite(effReview) && effReview > effBlock
  const toFailClosed = f.fallback === 'FAIL_CLOSED'
  const band = { low: num(image?.reviewThreshold), high: num(image?.blockThreshold) }

  const gate = !isAdmin ? adminTip
    : changes.length === 0 ? 'Nothing to save — change at least one field'
      : (blockBad || reviewBad) ? 'Limits must be numbers between 0 and 1'
        : undefined

  const save = async () => {
    // No batch endpoint for these keys — written one by one; the step-up window from the first
    // write covers the rest.
    const r = await act.run(async () => {
      let last = null
      for (const [k, v] of changes) last = await AutoModSettingsApi.putRaw(k, v)
      return last
    }, 'Image rules saved. Live within 30 seconds on every server.')
    if (r !== undefined) {
      setResp(r)
      setF(EMPTY_IMAGE)
      setConfirmOff(false)
      onSaved()
    }
  }

  return (
    <div className="card">
      <h2>Image checks (nudity filter) <Badge kind="gray">ADMIN only</Badge></h2>
      <Note>
        Every uploaded picture gets an AI nudity score from 0 to 1. At or above the{' '}
        <strong>block limit</strong> the upload is refused on the spot — nothing is stored. From the{' '}
        <strong>review limit</strong> up to that, the picture publishes <em>and</em> lands in the{' '}
        &ldquo;New posts to check&rdquo; queue for a person. Below the review limit nothing happens.
        Private chat pictures can be blocked but never go to the queue — staff do not see private chats.
      </Note>
      <Err e={act.err} /><Ok msg={act.ok} /><ServerMsgs r={resp} /><Loading on={loading} />

      {image ? (
        <>
          <div className="toolbar">
            <Badge kind={image.enabled ? 'green' : 'err'}>
              {image.enabled ? 'IMAGE CHECKS ARE ON' : 'IMAGE CHECKS ARE OFF'}
            </Badge>
            <span>if the AI is down: {image.fallback
              ? <Badge kind={image.fallback === 'FAIL_CLOSED' ? 'blue' : 'red'}>{image.fallback}</Badge>
              : <span className="muted">—</span>}</span>
            <span>video cover pictures {image.videoPosters
              ? <Badge kind="green">checked</Badge> : <Badge kind="err">not checked</Badge>}</span>
          </div>
          {globalEnabled === false && (
            <Warn>
              The big off switch for all AI checks is OFF, and it also stops image checks — the image
              switch here only matters once the big switch is back on.
            </Warn>
          )}
          {!image.enabled && globalEnabled !== false && (
            <Warn>Image checks are OFF. Every picture publishes with no nudity check at all.</Warn>
          )}
          <div className="mt-2"><ScoreMeter label="nsfw" band={band} /></div>
          <p className="footnote">
            The shaded bar: green = published quietly · middle = published, but a person must look ·
            red = the upload is refused. Limits now: review {fmtScore(image.reviewThreshold)} / block {fmtScore(image.blockThreshold)}.
          </p>
        </>
      ) : !loading && (
        <div className="empty">The server sent no image rules. The backend may be older than this page.</div>
      )}

      <div className="filters mt-2">
        <Field label="Image checks">
          <Select value={f.enabled} onChange={(v) => set('enabled', v)}
            options={[{ value: 'true', label: 'on' }, { value: 'false', label: 'off' }]} emptyLabel="(keep as is)" />
        </Field>
        <Field label="Block limit (0–1)">
          <input type="number" step="0.01" min="0" max="1" className="w-num" value={f.block}
            onChange={(e) => set('block', e.target.value)}
            placeholder={image?.blockThreshold != null ? `now ${fmtScore(image.blockThreshold)}` : 'blank = keep as is'} />
        </Field>
        <Field label="Review limit (0–1)">
          <input type="number" step="0.01" min="0" max="1" className="w-num" value={f.review}
            onChange={(e) => set('review', e.target.value)}
            placeholder={image?.reviewThreshold != null ? `now ${fmtScore(image.reviewThreshold)}` : 'blank = keep as is'} />
        </Field>
        <Field label="If the image AI is down">
          <Select value={f.fallback} onChange={(v) => set('fallback', v)} options={FALLBACKS} emptyLabel="(keep as is)" />
        </Field>
        <Field label="Check video cover pictures">
          <Select value={f.videoPosters} onChange={(v) => set('videoPosters', v)}
            options={[{ value: 'true', label: 'yes' }, { value: 'false', label: 'no' }]} emptyLabel="(keep as is)" />
        </Field>
        <button disabled={!!gate || act.busy} title={gate} className={disabling ? 'danger' : ''}
          onClick={() => (disabling ? setConfirmOff(true) : save())}>
          Save the image rules (extra password check)
        </button>
      </div>
      {(blockBad || reviewBad) && <Warn>Both limits must be numbers between 0 and 1.</Warn>}
      {willClamp && (
        <Warn>
          Your review limit ({fmtScore(effReview)}) is above the block limit ({fmtScore(effBlock)}).
          The server will lower it to the block limit for you, so the saved value will not be the one
          you typed. That safety rule means the review queue can never be switched off by a typo.
        </Warn>
      )}
      {toFailClosed && (
        <Warn>
          <code>FAIL_CLOSED</code> means: while the image AI is down, <strong>every</strong> picture and
          video upload on the platform is refused with an error. That is moderation-first on purpose —
          but treat a down image AI as an incident. The softer choice, <code>FAIL_OPEN_SHADOW</code>,
          publishes uploads and sends them to the queue for a person instead.
        </Warn>
      )}
      <Note>
        Tuning in plain words: a <strong>lower block limit</strong> is stricter — more uploads refused, and
        more false alarms (beach, medical and art photos are the classic ones). A <strong>lower review
        limit</strong> sends more borderline pictures to a person; a higher one keeps the queue small.
        There is no &ldquo;teach the AI&rdquo; for images — these two limits are the only lever. After any
        change, watch the queue and the block rate for a day before touching it again.
      </Note>

      {confirmOff && (
        <Confirm
          title="Turn off image checks"
          message={<>
            <p className="modal-lead">
              Every picture will publish with <strong>no nudity check at all</strong> — nothing is blocked
              and nothing goes to the queue. Pictures already in the queue stay there. Nothing is
              re-checked when you turn it back on.
            </p>
            <Err e={act.err} />
          </>}
          requireText="OFF"
          confirmLabel="Turn off (extra password check)"
          danger
          busy={act.busy}
          onConfirm={save}
          onClose={() => setConfirmOff(false)}
        />
      )}
    </div>
  )
}

const KEY_NAMESPACE = `enabled                                  big off switch, whole platform
enabled.<type>                           one content type
threshold.<label>.low | .high            default score limit
threshold.<type>.<label>.low | .high     per-type score limit (wins over the default)
hold.<type>.ms                           longest wait
inline.<type>.ms                         instant budget
fallback.<type>                          FAIL_CLOSED | FAIL_OPEN_SHADOW
livechat.buffer.ms
livechat.borderline.hidden
retrain.max-f1-drop
retrain.require-human-promote
image.enabled                            image checks on/off (ANDed with the big switch)
image.threshold.block                    nudity score that refuses the upload
image.threshold.review                   nudity score that sends it to a person (clamped to ≤ block)
image.fallback                           FAIL_CLOSED | FAIL_OPEN_SHADOW when the image AI is down
image.video-posters                      also check video cover pictures`

function RawOverrides({ overrides, isAdmin, adminTip, onChanged, loading }) {
  const act = useAction()
  const [form, setForm] = useState({ key: '', value: '' })
  const [confirmSet, setConfirmSet] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [resp, setResp] = useState(null)

  const rows = Object.entries(overrides || {}).map(([key, value]) => ({ key, value }))
  const k = form.key.trim()
  const v = form.value.trim()
  const disabling = /^enabled(\.[a-z_]+)?$/.test(k) && FALSEY.has(v.toLowerCase())
  const killSwitch = k === 'enabled' && FALSEY.has(v.toLowerCase())
  const block = !isAdmin ? adminTip : (!k || !v ? 'Type both a key and a value' : undefined)

  const put = async () => {
    const r = await act.run(() => AutoModSettingsApi.putRaw(k, v), `Override ${k} saved.`)
    if (r !== undefined) {
      setResp(r)
      setForm({ key: '', value: '' })
      setConfirmSet(false)
      onChanged()
    }
  }

  return (
    <div className="card">
      <h2>Raw override keys <Badge kind="gray">ADMIN only</Badge></h2>
      <Note>
        The expert tool: write any moderation settings key directly, with no form in between. Only keys an
        admin changed by hand appear here — everything else comes from the built-in starting values.
      </Note>
      {!isAdmin && <Warn>{adminTip} You can read this list, but every button below is off for your role.</Warn>}
      <DataTable
        columns={[
          { key: 'key', label: 'Key', render: (r) => <code>{r.key}</code> },
          { key: 'value', label: 'Value', render: (r) => <span className="mono">{String(r.value)}</span> },
          {
            key: '_', label: '', render: (r) => (
              <button className="small danger" disabled={!isAdmin || act.busy} title={adminTip}
                onClick={async (e) => {
                  e.stopPropagation()
                  const res = await act.run(() => AutoModSettingsApi.deleteRaw(r.key), `Override ${r.key} removed — back to the starting value.`)
                  if (res !== undefined) { setResp(res); onChanged() }
                }}>Remove</button>
            )
          },
        ]}
        rows={rows}
        rowKey={(r) => r.key}
        onRow={(r) => setForm({ key: r.key, value: String(r.value) })}
        loading={loading}
        empty="No overrides — the starting settings are running unchanged."
      />

      <div className="filters mt-2">
        <Field label="Key">
          <input value={form.key} onChange={(e) => setForm((s) => ({ ...s, key: e.target.value }))} placeholder="threshold.post.insult.high" className="w-id" />
        </Field>
        <Field label="Value">
          <input value={form.value} onChange={(e) => setForm((s) => ({ ...s, value: e.target.value }))} placeholder="0.85" className="w-sm" />
        </Field>
        <button disabled={!!block || act.busy} title={block} className={disabling ? 'danger' : ''}
          onClick={() => (disabling ? setConfirmSet(true) : put())}>
          Save this key (extra password check)
        </button>
        <button className="danger" disabled={!isAdmin || act.busy} title={adminTip} onClick={() => setConfirmReset(true)}>
          Reset every override… (extra password check)
        </button>
      </div>
      {killSwitch && (
        <Warn>
          <code>enabled = {v}</code> is the BIG OFF SWITCH: the AI stops checking everything, everywhere.
          The blocked-words list still works. Nothing else is checked until you remove this key.
        </Warn>
      )}
      {disabling && !killSwitch && <Warn><code>{k} = {v}</code> stops AI checks for that content type. The blocked-words list still works.</Warn>}
      <Err e={act.err} /><Ok msg={act.ok} /><ServerMsgs r={resp} />
      <p className="footnote">Keys you can use:</p>
      <pre className="json">{KEY_NAMESPACE}</pre>

      {confirmSet && (
        <Confirm
          title={killSwitch ? 'Big off switch — stop AI checks everywhere' : `Turn off AI checks for ${k}`}
          message={<>
            <p className="modal-lead">{killSwitch
              ? 'Setting enabled = false stops AI checks on every surface. The blocked-words list still works. Nothing else is checked until you remove this key.'
              : `Setting ${k} = ${v} stops AI checks for that content type. The blocked-words list still works.`}</p>
            <Err e={act.err} />
          </>}
          requireText="DISABLE"
          confirmLabel="Save this key (extra password check)"
          danger
          busy={act.busy}
          onConfirm={put}
          onClose={() => setConfirmSet(false)}
        />
      )}
      {confirmReset && (
        <Confirm
          title="Reset every override"
          message={<>
            <p className="modal-lead">
              This removes every changed setting at once — score limits, wait times, fallbacks and the on/off
              switches all go back to the starting values. There is no undo. To get an override back you must
              type it in again by hand.
            </p>
            <Err e={act.err} />
          </>}
          requireText="RESET"
          confirmLabel="Reset everything (extra password check)"
          danger
          busy={act.busy}
          onConfirm={async () => {
            const r = await act.run(() => AutoModSettingsApi.reset(), 'Every override removed — the starting settings are back.')
            if (r !== undefined) {
              setResp(r)
              setConfirmReset(false)
              onChanged()
            }
          }}
          onClose={() => setConfirmReset(false)}
        />
      )}
    </div>
  )
}
