import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { AutoModModelApi } from '../../api'
import { useLoad, useAction, pageRows, fmtNum, saveBlob } from '../../util'
import { DataTable, Pager, Tabs, Modal, Confirm, Err, Ok, Note, Warn, Field, Select, Badge, Tiles, SeriesBars, PageIntro, HowTo } from '../../components/ui'
import { TRAINING_SOURCES, LabelPills, LabelCheckboxes, labelsToBody, anyLabelSet, ScoreGrid } from '../../components/moderation'
import { useAuth } from '../../auth/AuthContext'

const PAGE_SIZES = ['25', '50', '100']

/** Where an example came from — raw enum values, plain labels around them. */
const SOURCE_OPTIONS = [
  { value: 'ADMIN_MANUAL', label: 'Typed in by staff (ADMIN_MANUAL)' },
  { value: 'ADMIN_CORRECTION', label: 'Staff corrected the AI (ADMIN_CORRECTION)' },
  { value: 'REVIEW_PROMOTION', label: 'Staff agreed with the AI (REVIEW_PROMOTION)' },
  { value: 'ADMIN_IMPORT', label: 'From a file import (ADMIN_IMPORT)' },
  { value: 'SEED_DATASET', label: 'Starter data (SEED_DATASET)' },
  { value: 'USER_REPORT_CONFIRMED', label: 'Confirmed user reports (USER_REPORT_CONFIRMED)' },
  // Anything new the server starts sending still needs to be filterable.
  ...TRAINING_SOURCES.filter((s) => !['ADMIN_MANUAL', 'ADMIN_CORRECTION', 'REVIEW_PROMOTION', 'SEED_DATASET', 'USER_REPORT_CONFIRMED'].includes(s)),
]

/** These endpoints return `items`, not Spring's `content`; golden cases may come back as a bare array. */
const rowsOf = (d) => (Array.isArray(d?.items) ? d.items : pageRows(d))

/** `totalElements` arrives without `totalPages`, and Pager needs both before it will page. */
const pagerData = (d, pageSize) => {
  if (!d || d.totalPages != null || d.totalElements == null) return d
  return { totalElements: d.totalElements, totalPages: Math.max(1, Math.ceil(d.totalElements / pageSize)) }
}

const tile = (n) => (n == null ? undefined : fmtNum(n))

export default function DatasetPage() {
  const [tab, setTab] = useState('examples')
  return (
    <div>
      <PageIntro
        title="Teach the AI"
        lead="Give the AI examples so it learns what is okay and what is not."
        bullets={[
          'You can add one sentence with its labels.',
          'You can add one word — the server turns it into example sentences.',
          'You can import many rows at once from a CSV file.',
          'You can manage the golden test cases that guard every new AI version.',
          'You can test any text against the live AI.',
        ]}
      />
      <Note>
        Teaching here is the slow lever: the AI only changes after a new training run starts being used
        (see <Link to="/moderation/model">AI versions</Link>). For an instant ban of one exact word, use{' '}
        <Link to="/moderation/blocklist">Blocked words</Link> — and do both when you want both.
      </Note>
      <Tabs
        tabs={[
          { id: 'examples', label: 'Examples' },
          { id: 'import', label: 'Import a file (CSV)' },
          { id: 'golden', label: 'Golden test cases' },
          { id: 'probe', label: 'Test some text' },
        ]}
        active={tab} onChange={setTab}
      />
      {tab === 'examples' && <Examples />}
      {tab === 'import' && <ImportTab />}
      {tab === 'golden' && <Golden />}
      {tab === 'probe' && <Probe />}
    </div>
  )
}

function DatasetTable({ rows, empty, onDelete, deleteDisabled, deleteTitle, busy, loading }) {
  const columns = [
    { key: 'text', label: 'Text', render: (r) => (r.text ? <span className="case-preview" title={r.text}>{r.text}</span> : <span className="muted">—</span>) },
    { key: 'labels', label: 'Labels', render: (r) => <LabelPills labels={r.labels} /> },
    { key: 'source', label: 'Where it came from', render: (r) => (r.source ? <Badge kind="gray">{r.source}</Badge> : <span className="muted">—</span>) },
    { key: 'note', label: 'Note', render: (r) => r.note || <span className="muted">—</span> },
    // Untrained rows are exactly what the next retrain picks up.
    { key: 'trainedInVersion', label: 'Trained in', render: (r) => (r.trainedInVersion ? <code>{r.trainedInVersion}</code> : <Badge kind="blue">not trained yet</Badge>) },
    { key: 'addedAt', label: 'Added' },
  ]
  if (onDelete) {
    columns.push({
      key: '_', label: '', render: (r) => (
        <button className="small danger" disabled={deleteDisabled || busy} title={deleteTitle} onClick={() => onDelete(r)}>Delete</button>
      ),
    })
  }
  return <DataTable columns={columns} rows={rows} empty={empty} rowKey={(r) => r.id} loading={loading} />
}

function Examples() {
  const { user } = useAuth()
  const canWrite = user?.role === 'ADMIN' || user?.role === 'MODERATOR'
  const denied = canWrite ? undefined : `You need the ADMIN or MODERATOR role. Your role is ${user?.role || 'unknown'}.`

  const [source, setSource] = useState(undefined)
  const [pageSize, setPageSize] = useState(25)
  const [page, setPage] = useState(0)
  const { data, err, loading, reload } = useLoad(() => AutoModModelApi.examples({ source, page, pageSize }), [source, page, pageSize])
  const act = useAction()
  const [res, setRes] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [wordOpen, setWordOpen] = useState(false)
  const [wordResult, setWordResult] = useState(null)

  const s = data?.summary
  const created = rowsOf(wordResult)

  return (
    <div>
      <HowTo steps={[
        'Click "Add a sentence" to teach with one real sentence and its labels.',
        'Click "Add a word" to teach a single word — the server makes example sentences from it.',
        'Use the "Where it came from" filter to find rows, for example a bad file import.',
        'Delete wrong rows before the next training run — after that they are baked in.',
        'When "Not trained yet" grows large, start a training run on the "AI versions" page.',
      ]} />
      <Tiles items={[
        { label: 'Training examples', value: tile(s?.total ?? data?.totalElements) },
        { label: 'Not trained yet', value: tile(s?.untrained), sub: 'when this reaches about fifty, a new training run is worth it' },
        { label: 'Golden test cases', value: tile(s?.goldenCases), sub: 'kept out of training — they guard every new version' },
      ]} />
      <div className="grid2">
        <div className="card">
          <h2>Where the examples came from</h2>
          <SeriesBars series={s?.bySource} />
        </div>
        <div className="card">
          <h2>How many of each label</h2>
          <SeriesBars series={s?.labelTotals} />
        </div>
      </div>

      <div className="filters">
        <Field label="Where it came from"><Select value={source} onChange={(v) => { setPage(0); setSource(v) }} options={SOURCE_OPTIONS} emptyLabel="(all)" /></Field>
        <Field label="Rows per page">
          <Select value={String(pageSize)} onChange={(v) => { setPage(0); setPageSize(Number(v) || 25) }} options={PAGE_SIZES} allowEmpty={false} />
        </Field>
        <button className="secondary" onClick={reload}>Refresh the list</button>
        <button disabled={!canWrite} title={denied} onClick={() => setAddOpen(true)}>+ Add a sentence</button>
        <button className="secondary" disabled={!canWrite} title={denied} onClick={() => { setWordResult(null); setWordOpen(true) }}>+ Add a word</button>
      </div>

      <Err e={err} /><Err e={act.err} /><Ok msg={act.ok} />
      {res?.note && <Note>{res.note}</Note>}
      {res?.warning && <Warn>{res.warning}</Warn>}
      {data?.note && <Note>{data.note}</Note>}
      {data?.warning && <Warn>{data.warning}</Warn>}

      <DatasetTable
        rows={rowsOf(data)}
        empty="No training examples match this filter. Nothing to fix here."
        onDelete={async (r) => {
          const out = await act.run(() => AutoModModelApi.deleteExample(r.id), 'Example deleted.')
          if (out !== undefined) setRes(out)
          reload()
        }}
        deleteDisabled={!canWrite}
        deleteTitle={denied}
        busy={act.busy}
        loading={loading}
      />
      <Pager data={pagerData(data, pageSize)} page={page} onPage={setPage} />

      {created.length > 0 && (
        <div className="card">
          <h2>Sentences made from that word</h2>
          <Note>The word itself is not stored — the sentences made from it are. This is what the next training run reads.</Note>
          <DatasetTable rows={created} empty="The server created no rows." />
        </div>
      )}

      {addOpen && (
        <SentenceModal
          title="Add a sentence"
          intro="The best kind of teaching: a real sentence with the labels you would give it yourself."
          submitLabel="Save this example"
          save={(body) => AutoModModelApi.addExample(body)}
          onSaved={(r) => { setRes(r); act.setOk('Example saved.'); reload() }}
          onClose={() => setAddOpen(false)}
        >
          <Note>
            Saving the same text again <strong>updates</strong> its labels instead of making a copy. So to
            fix a wrong label, paste the sentence again with the right ticks.
          </Note>
        </SentenceModal>
      )}
      {wordOpen && (
        <WordModal
          onSaved={(r) => { setRes(r); setWordResult(r); act.setOk('The word was turned into training sentences.'); reload() }}
          onClose={() => setWordOpen(false)}
        />
      )}
    </div>
  )
}

/* ---------------- CSV import ---------------- */

const SENTENCES_TEMPLATE = `text,toxic,severe_toxic,obscene,threat,insult,identity_hate,note
"You are a complete waste of everyone's time.",1,0,0,0,1,0,"common insult phrasing"
"I will find you and hurt you.",1,0,0,1,0,0,"clear threat"
"This methodology section is weak but fixable.",0,0,0,0,0,0,"clean row — hard critique is not abuse"`

const WORDS_TEMPLATE = `word,toxic,severe_toxic,obscene,threat,insult,identity_hate,blocklist,severity,note
badword1,1,0,1,0,0,0,yes,BLOCK,"ban now AND teach the AI"
badword2,1,0,1,0,0,0,no,,"mild — teach only, no hard ban"`

function ImportTab() {
  const { user } = useAuth()
  const canWrite = user?.role === 'ADMIN' || user?.role === 'MODERATOR'
  const denied = canWrite ? undefined : `You need the ADMIN or MODERATOR role. Your role is ${user?.role || 'unknown'}.`

  const [file, setFile] = useState(null)
  const [kind, setKind] = useState('sentences')
  const [allowPartial, setAllowPartial] = useState(false)
  const [check, setCheck] = useState(null)   // {key, res} — last safe test, keyed to file+options
  const [result, setResult] = useState(null) // last real import response
  const [confirmOpen, setConfirmOpen] = useState(false)
  const act = useAction()

  const fileKey = file ? `${file.name}:${file.size}:${file.lastModified}` : ''
  const key = JSON.stringify({ fileKey, kind, allowPartial })
  const fresh = !!check && check.key === key
  const checkErrors = fresh ? (check.res?.errors || []) : []
  const canImport = fresh && (checkErrors.length === 0 || allowPartial)

  const checkBlock = !canWrite ? denied : !file ? 'Choose a file first' : undefined
  const importBlock = checkBlock
    || (!fresh ? 'Run "Check the file first" for this exact file and options' : undefined)
    || (!canImport ? 'The check found bad rows. Fix the file, or tick "Save the good rows anyway".' : undefined)

  const runCheck = async () => {
    setResult(null)
    const r = await act.run(
      () => AutoModModelApi.importExamples(file, { kind, dryRun: true, allowPartial }),
      'Check done. Nothing was saved.',
    )
    if (r !== undefined) setCheck({ key, res: r })
  }

  const runImport = async () => {
    const r = await act.run(
      () => AutoModModelApi.importExamples(file, { kind, dryRun: false, allowPartial }),
      'Import finished.',
    )
    if (r !== undefined) { setResult(r); setConfirmOpen(false) }
  }

  const downloadErrors = (errors) => {
    const csv = 'row,error\n' + errors.map((e) => `${e.row},"${String(e.error || '').replace(/"/g, '""')}"`).join('\n')
    saveBlob(new Blob([csv], { type: 'text/csv' }), 'import-errors.csv')
  }

  const renderReport = (r, heading) => {
    const isWords = (r.kind || kind) === 'words'
    return (
    <div className="card">
      <h2>{heading}</h2>
      {r.dryRun
        ? <Note>This was the safe check — nothing was saved.</Note>
        : <Note>This import is done. Word rows with <code>blocklist=yes</code> are banned right now; the training rows wait for the next training run.</Note>}
      {r.note && <Note>{r.note}</Note>}
      {r.warning && <Warn>{r.warning}</Warn>}
      <Tiles items={[
        { label: 'Rows in the file', value: tile(r.totalRows) },
        { label: r.dryRun ? 'Rows that would be saved' : 'Rows saved', value: tile(r.applied) },
        { label: 'Rows that already existed (labels updated)', value: tile(r.updated) },
        isWords && { label: 'Added to blocked words', value: tile(r.blocklistAdded), sub: 'these bans are live right away' },
        isWords && { label: 'Training sentences made', value: tile(r.trainingRowsCreated), sub: 'each word becomes several sentences' },
      ].filter(Boolean)} />
      {(r.errors || []).length > 0 ? (
        <>
          <Warn>
            {r.errors.length} bad row(s). {r.dryRun
              ? 'These rows would be a problem if you import.'
              : Number(r.applied) === 0
                ? 'Nothing was saved because of these rows (all-or-nothing).'
                : 'The clean rows were saved; these rows were skipped.'} The row number
            counts data rows, starting at 1 (the header row does not count).
          </Warn>
          <DataTable
            columns={[
              { key: 'row', label: 'Row number' },
              { key: 'error', label: 'What is wrong' },
            ]}
            rows={r.errors}
            rowKey={(x) => String(x.row)}
            empty="No errors."
          />
          <button className="secondary small mt-2" onClick={() => downloadErrors(r.errors)}>
            Download the error list (CSV)
          </button>
        </>
      ) : <Note>No bad rows. The whole file is clean.</Note>}
    </div>
    )
  }

  return (
    <div>
      <HowTo steps={[
        'Make your file in Excel or Google Sheets.',
        'Save it as "CSV UTF-8". Plain CSV can break Arabic and Kurdish letters.',
        'Pick the file kind: full sentences, or single words.',
        'Click "Check the file first". The server reads the whole file and lists any bad rows. Nothing is saved.',
        'Fix bad rows and check again — or tick "Save the good rows anyway".',
        'Click "Import for real". You will get the extra password check.',
      ]} />
      <Note>
        Two rules that decide if an import helps or hurts: 1) include clean rows too — about one third with
        all labels 0. A file where every row is toxic teaches the AI that everything is toxic.
        2) never import your golden test cases — they must stay out of training, or they stop guarding anything.
      </Note>

      <div className="card">
        <h2>Upload and check</h2>
        <div className="filters">
          <Field label="CSV file (max 5000 data rows)">
            <input type="file" accept=".csv,text/csv" onChange={(e) => { setFile(e.target.files?.[0] || null); setResult(null) }} />
          </Field>
          <Field label="What is in the file">
            <Select value={kind} onChange={(v) => setKind(v || 'sentences')} allowEmpty={false}
              options={[
                { value: 'sentences', label: 'Full sentences with labels' },
                { value: 'words', label: 'Single words (can also add to blocked words)' },
              ]} />
          </Field>
          <Field label="Save the good rows anyway">
            <input type="checkbox" checked={allowPartial} onChange={(e) => setAllowPartial(e.target.checked)} />
          </Field>
        </div>
        <Note>
          Off (default) = all-or-nothing: one bad row means nothing is saved. On = the clean rows are saved
          and the bad rows come back as a list. A row whose text already exists updates its labels — it never
          makes a copy, so re-uploading a corrected file is safe.
        </Note>
        <div className="row mt-2">
          <button className="secondary" disabled={!!checkBlock || act.busy} title={checkBlock} onClick={runCheck}>
            Check the file first (safe test)
          </button>
          <button disabled={!!importBlock || act.busy} title={importBlock} onClick={() => setConfirmOpen(true)}>
            Import for real… (extra password check)
          </button>
          {file && <span className="muted">{file.name} · {fmtNum(file.size)} bytes</span>}
        </div>
        <Err e={act.err} /><Ok msg={act.ok} />
      </div>

      {fresh && !result && renderReport(check.res, 'Check result')}
      {result && renderReport(result, 'Import result')}

      <div className="grid2">
        <div className="card">
          <h2>Sentences file — columns</h2>
          <Note>
            One row per sentence. The six label columns take 0 or 1 (blank = 0). Put quotes around text
            that has commas. <code>note</code> is optional (max 300 letters).
          </Note>
          <pre className="json">{SENTENCES_TEMPLATE}</pre>
        </div>
        <div className="card">
          <h2>Words file — columns</h2>
          <Note>
            One row per word. <code>blocklist=yes</code> also adds the word to{' '}
            <Link to="/moderation/blocklist">Blocked words</Link> — that ban starts right away, no training
            needed. <code>severity</code> is only read when blocklist=yes (BLOCK or FLAG; blank = BLOCK).
          </Note>
          <pre className="json">{WORDS_TEMPLATE}</pre>
        </div>
      </div>

      {confirmOpen && (
        <Confirm
          title="Import this file for real"
          message={<>
            <p className="modal-lead">
              File: <code>{file?.name}</code> · kind: <strong>{kind}</strong>
              {fresh && check.res?.totalRows != null ? <> · {fmtNum(check.res.totalRows)} data rows</> : null}.
            </p>
            <p>
              This writes into the training data{kind === 'words' ? ', and rows with blocklist=yes are banned right away' : ''}.
              Imported rows are marked ADMIN_IMPORT, so you can find and delete a bad batch later on the Examples tab.
            </p>
            {checkErrors.length > 0 && (
              <Warn>{checkErrors.length} bad row(s) will be skipped because "Save the good rows anyway" is on.</Warn>
            )}
            <Err e={act.err} />
          </>}
          requireText="IMPORT"
          confirmLabel="Import now (extra password check)"
          danger
          busy={act.busy}
          onConfirm={runImport}
          onClose={() => setConfirmOpen(false)}
        />
      )}
    </div>
  )
}

function Golden() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const denied = isAdmin ? undefined : `Only ADMIN can change the golden set. Your role is ${user?.role || 'unknown'}.`

  const [pageSize, setPageSize] = useState(25)
  const [page, setPage] = useState(0)
  const { data, err, loading, reload } = useLoad(() => AutoModModelApi.goldenCases({ page, pageSize }), [page, pageSize])
  const act = useAction()
  const [res, setRes] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [delRow, setDelRow] = useState(null)

  return (
    <div>
      <HowTo steps={[
        'Pick a hard case — a text the AI got wrong or almost wrong.',
        'Click "+ Add a golden test case" and save the text with its labels.',
        'That is all. The case is never used for training — it only tests every new AI version.',
      ]} />
      <Note>
        The golden test cases are a fixed exam. Every new AI version must still get them right before it can
        be used. They are <strong>never trained on</strong> — training on them would turn the exam into
        memory practice. The best cases are the hard ones: tricky spelling dodges, reclaimed words used in a
        friendly way, medical terms, sarcasm you decided was fine.
      </Note>

      <div className="filters">
        <Field label="Rows per page">
          <Select value={String(pageSize)} onChange={(v) => { setPage(0); setPageSize(Number(v) || 25) }} options={PAGE_SIZES} allowEmpty={false} />
        </Field>
        <button className="secondary" onClick={reload}>Refresh the list</button>
        <button disabled={!isAdmin} title={denied} onClick={() => setAddOpen(true)}>+ Add a golden test case</button>
      </div>

      <Err e={err} /><Err e={act.err} /><Ok msg={act.ok} />
      {res?.note && <Note>{res.note}</Note>}
      {res?.warning && <Warn>{res.warning}</Warn>}
      {data?.note && <Note>{data.note}</Note>}
      {data?.warning && <Warn>{data.warning}</Warn>}

      <DatasetTable
        rows={rowsOf(data)}
        empty="No golden test cases yet — an empty exam guards nothing."
        onDelete={setDelRow}
        deleteDisabled={!isAdmin}
        deleteTitle={denied}
        busy={act.busy}
        loading={loading}
      />
      <Pager data={pagerData(data, pageSize)} page={page} onPage={setPage} />

      {addOpen && (
        <SentenceModal
          title="Add a golden test case"
          intro="Same shape as a training example, opposite purpose: this row is kept OUT of training and every new AI version is tested against it before it can be used."
          submitLabel="Add this test case"
          save={(body) => AutoModModelApi.addGoldenCase(body)}
          onSaved={(r) => { setRes(r); act.setOk('Golden test case added.'); reload() }}
          onClose={() => setAddOpen(false)}
        >
          <Note>
            Pick something the current AI got wrong or nearly wrong. A case every version already passes
            tells you nothing on the day it matters.
          </Note>
        </SentenceModal>
      )}
      {delRow && (
        <Confirm
          title="Delete this golden test case"
          message="Deleting a test case quietly makes the exam easier for every future AI version, and nothing will warn about the gap. Delete only when the case itself was wrong."
          requireText="DELETE"
          confirmLabel="Delete it"
          busy={act.busy}
          onClose={() => setDelRow(null)}
          onConfirm={async () => {
            const out = await act.run(() => AutoModModelApi.deleteGoldenCase(delRow.id), 'Golden test case deleted.')
            if (out !== undefined) setRes(out)
            setDelRow(null); reload()
          }}
        />
      )}
    </div>
  )
}

function Probe() {
  const [text, setText] = useState('')
  const act = useAction()
  const [res, setRes] = useState(null)
  const inferenceDown = String(act.err?.errorCode || '').includes('INFERENCE')

  return (
    <div>
      <HowTo steps={[
        'Paste the text you want to check.',
        'Click "Score this text".',
        'Read the six scores. Nothing is saved.',
      ]} />
      <div className="card">
        <h2>Test some text against the live AI</h2>
        <Note>
          The fastest answer to "why did this get through?". You get the same six scores the AI gave — or
          would give — without digging through cases. Nothing is saved: testing is not teaching.
        </Note>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the text you want scored…" />
        <div className="row mt-2">
          <button disabled={!text.trim() || act.busy} onClick={async () => {
            setRes(null) // a stale grid under a fresh inference error reads as a current score
            const r = await act.run(() => AutoModModelApi.scoreProbe(text))
            if (r) setRes(r)
          }}>{act.busy ? 'Scoring…' : 'Score this text'}</button>
        </div>
        <Err e={act.err} />
        {inferenceDown && (
          <Warn>
            This test is the one place where a dead AI computer shows itself directly — everywhere else the
            system quietly falls back to its safety rules. If this fails, live content is being decided by
            those fallback rules right now, not by the AI.
          </Warn>
        )}
        {res?.note && <Note>{res.note}</Note>}
        {res?.warning && <Warn>{res.warning}</Warn>}
        {res && (
          <div className="mt-2">
            <div className="row" style={{ gap: 14 }}>
              <span>AI version <code>{res.modelVersion ?? '—'}</code></span>
              <span className="muted mono">{res.inferenceMs != null ? `${res.inferenceMs} ms` : '—'}</span>
            </div>
            <p className="footnote">
              These are raw scores with no limits drawn, so the page gives no verdict. Whether any of them would
              block depends on the limits set for the content type it would be posted to.
            </p>
            <ScoreGrid scores={res.scores} />
          </div>
        )}
      </div>
    </div>
  )
}

/** Hand-rolled rather than FormModal: FormModal has no label-picker field type. */
function SentenceModal({ title, intro, submitLabel, save, onSaved, onClose, children }) {
  const [text, setText] = useState('')
  const [labels, setLabels] = useState({})
  const [note, setNote] = useState('')
  const act = useAction()

  const submit = async (e) => {
    e.preventDefault()
    const r = await act.run(() => save({ text, labels: labelsToBody(labels), note: note || undefined }), null)
    if (r !== undefined) { onSaved(r); onClose() }
  }

  return (
    <Modal title={title} onClose={onClose} wide>
      <p className="modal-lead">{intro}</p>
      {children}
      <form onSubmit={submit} className="form-col">
        <label className="field">
          <span>Text *</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="The sentence exactly as someone would post it…" />
        </label>
        <div className="field">
          <span>Labels — tick every one that applies</span>
          <LabelCheckboxes value={labels} onChange={setLabels} />
        </div>
        {!anyLabelSet(labels) && (
          <Note>
            Nothing is ticked, so this saves as a CLEAN example (all six labels 0). That is useful too — clean
            examples stop the AI from flagging normal disagreement. Tick a label first if you meant otherwise.
          </Note>
        )}
        <label className="field">
          <span>Note</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this example — the next person reads this" />
        </label>
        <Err e={act.err} />
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={act.busy || !text.trim()}>{act.busy ? 'Working…' : submitLabel}</button>
        </div>
      </form>
    </Modal>
  )
}

function WordModal({ onSaved, onClose }) {
  const [word, setWord] = useState('')
  const [labels, setLabels] = useState({})
  const [note, setNote] = useState('')
  const act = useAction()

  const submit = async (e) => {
    e.preventDefault()
    const r = await act.run(() => AutoModModelApi.addWord({ word, labels: labelsToBody(labels), note: note || undefined }), null)
    if (r !== undefined) { onSaved(r); onClose() }
  }

  return (
    <Modal title="Add a word" onClose={onClose} wide>
      <p className="modal-lead">
        One bare word teaches the AI almost nothing, so the server builds several example sentences from it
        and stores those instead. You will see every sentence it created.
      </p>
      <Warn>
        This does NOT add the word to <Link to="/moderation/blocklist">Blocked words</Link>. Teaching here
        only works after the next training run; the blocked-words list bans it right now. When you want
        both, do both.
      </Warn>
      <form onSubmit={submit} className="form-col">
        <label className="field">
          <span>Word *</span>
          <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="a single word or term" />
        </label>
        <div className="field">
          <span>Labels — tick every one that applies</span>
          <LabelCheckboxes value={labels} onChange={setLabels} />
        </div>
        {!anyLabelSet(labels) && (
          <Note>Nothing is ticked — every made sentence saves as clean. Right for a word being wrongly flagged; wrong for a slur.</Note>
        )}
        <label className="field">
          <span>Note</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Context — reclaimed use, dialect, where you saw it" />
        </label>
        <Err e={act.err} />
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={act.busy || !word.trim()}>{act.busy ? 'Working…' : 'Make sentences from this word'}</button>
        </div>
      </form>
    </Modal>
  )
}
