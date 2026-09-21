# Hikmah Admin Dashboard (hikma-admin)

React + Vite admin dashboard for the IRC platform's fully-implemented Spring Boot admin
backend (`/api/v1/admin/**`, ~278 endpoints across 32 controllers). Every endpoint in
`docs/admin/api/*` and `docs/moderation/api.md` is wired into the UI. Simple, logic-first
UI using the Stanford identity palette (Cardinal Red `#8C1515`, Cool Gray `#53565A`,
Digital Blue `#006CB8`, Digital Green `#008566`, Digital Red `#B1040E`).

## Run

```bash
npm install
npm run dev        # http://localhost:5174, proxies /api → http://localhost:8080
```

- Backend on another host/port: `VITE_PROXY_TARGET=http://host:8080 npm run dev`,
  or bypass the proxy entirely with `VITE_API_BASE=http://host:8080 npm run dev`
  (needs CORS on the backend).
- Production build: `npm run build` → `dist/` (serve behind the same origin as the API,
  or set `VITE_API_BASE` at build time).

## What's implemented

Every domain from the API reference, one nav section each:

| Section | Coverage |
|---|---|
| Dashboard | analytics overview tiles, dependency health chips, live audit ticker (SSE) |
| Users | directory w/ filters, full detail (overview, PII reveal, sessions, login events, settings audit, moderation, data lifecycle), role change, disable/enable, lock/unlock, password/2FA reset, email verify, identity edit, deletion/purge/hold, strikes, create/bulk/invite (+resend/revoke), bulk-action, impersonation (banner + exit), growth analytics |
| Moderation | reports inbox (3 feeders), keyword-hit resolve, bulk actions w/ per-target results, posts browse/inspect/remove/restore, comment/story delete (typed confirm), highlight unpin, blocklist CRUD + dry-run tester |
| Classifier (automated text moderation) | review queue (risk/oldest sort, SLA filter, per-case + ≤100 bulk decide with `teachModel`, rescore); case workbench rendering every field's six scores **against the threshold bands in force**, worst-of entity verdict, redaction for chat/live-chat; model health & SLA board (band breakdown, per-label, per-type SLA, circuit/registry warnings); policy editor with **dry-run gated in front of save**, hold durations + fallback, raw override layer + kill switch + reset (ADMIN); training dataset (sentence/word/golden-case CRUD, source filter, score probe); model registry (retrain, promotion gate + forced override, shadow, rollback) |
| Sounds | **admin-curated catalog** — single create + bulk official import (the only two ways in; both land `APPROVED`), status tiles w/ ES `-1` sentinel, catalog browse, inspector (cover, player, blast radius + `posts_by_sound` page, provenance, per-resource audit strip), approve/reject/archive/restore/takedown(+mute)/hard-delete, recategorize, edit, trending-exclude, uploader history + approval ratio, trending board, `irc-sounds` index health + reindex |
| Safety | grouped triage queue, report workbench (triage/dismiss/action/appeals, evidence, group, linked strikes), strikes ledger (issue/revoke), per-user record + consent viewer, analytics + block stats |
| Research / QnA | browse/top/flags, unpublish/retract/delete, flag+resolve, downloads log; question close/reopen/archive/delete, answer delete |
| Tags & Knowledge | trending overrides (pin/ban/revoke/rebuild), hide/unhide, merge, backfill (typed confirm); topics/madhhabs CRUD + retire + cache evict |
| Chat & Live | overview, group/channel browse, calls + stats, message-request stats; channel directory + stats override + verify/takedown/restore/unlist/freeze + invite-link revoke; stream fleet + detail + force-stop/rotate-key/guest-remove + recordings fleet + gift rollup; dual-control legal holds incl. execute + released-content viewer |
| Media | pipeline board, asset browse/inspect/reprocess/delete, purge-raw + reconcile (dry-run-first), quotas, storage top-N |
| Notifications | stats, type registry, announcement composer (dry-run → confirm-large-audience → send/schedule/cancel), digest run, email stats/ledger/test, push-token purge |
| Search & Feed | index board, health+drift, 7 reindexes (typed confirm) + async reindex-all, top/zero-result queries; feed weights/config/patch/preview/explain/affinity; PYMK knobs + explain |
| Logs & Audit | explorer w/ grammar + saved views + CSV export (step-up), login events, alert rules CRUD + firings, retention board, OTP stats; per-user/per-resource audit browsers + live SSE tail |
| Analytics | overview, content/engagement/trending, series by metric, funnel, retention grid, rollup/backfill, raw events sample (step-up), anomaly thresholds + firings, CSV export |
| Operations | composite health, SSE fleet, job ledger + run/pause/resume, queues + DLQ browse/requeue/discard, Redis INFO + allowlisted flush, config registry (step-up) + reconciler, media plane, orphan-stream sweep (dry-run-first), chat-ES backfill |
| Activity | break-glass case lifecycle (open → second-admin approve → close), gated timeline/histogram/reels/export, routine erasure |
| Discovery | contact-sync stats, consent compliance report, per-user flags/QR rotate/PYMK inspect+recompute, contact-hash purge |

## Cross-cutting behavior (per the frontend guide)

- **Auth**: Bearer JWT; 401 → single-flight refresh → retry → hard logout. Role decoded
  client-side to drive nav (server 403 remains the backstop).
- **Step-up**: any 403 `STEP_UP_REQUIRED` opens the global modal (password or TOTP),
  arms `POST /api/v1/security/step-up`, then auto-retries the original request with the
  **same Idempotency-Key**. Armed-until is cached ~290s client-side to skip the modal.
- **Idempotency-Key** is auto-generated for every mutating request.
- **Impersonation**: token held in memory only; red banner with countdown + Exit.
- **SSE**: one shared `EventSource` to `/api/v1/admin/audit/stream?token=…` feeds the
  ticker, home feed and the live tail; auto-reconnect with backoff.
- **Pagination**: Spring `Page` pager and keyset "load more" (cursor = last `createdAt`).
- **`note`/`warning` fields** from responses are always rendered (info line / banner).
- **Danger zone**: typed confirmations (PURGE / DELETE / EXECUTE / BACKFILL…) on top of
  server-side step-up; dry-run defaults ON for purge-raw, reconcile and the orphan sweep.
- **Error envelope**: `errorCode`, `message`, `details`, `fieldErrors` rendered inline.

## The two moderation queues are not merged, on purpose

`/moderation` (**Reports inbox**) and `/moderation/review` (**Review queue**) look similar and
ask opposite questions. They have different row shapes, different mental models, and a
different consequence for a mis-click, so the UI keeps them apart and cross-links instead.

| | Reports inbox `/moderation` | Review queue `/moderation/review` |
|---|---|---|
| Fed by | users reporting content, failed media scans, keyword hits | the classifier, when it could not decide |
| Asks | "was this report valid?" | "is this over the line?" |
| The content is | already live | invisible to everyone but its author |
| Deciding it | takes something down | **releases or buries** — it is not a takedown |

Two consequences the classifier pages enforce rather than merely document:

- **A score is never shown without its band.** `ScoreMeter` draws each label on a 0→1 track
  shaded into its three bands, because 0.42 `insult` inside `0.30/0.80` and 0.42 `threat`
  inside `0.15/0.50` are different decisions and the number alone cannot say so.
- **Chat and live-chat bodies are never rendered.** `isRedacted()` gates the text pane and
  forces `teachModel` off for those types — the server ignores it there anyway, because
  promoting a private message into the training set would bake it into model weights.

Threshold edits are gated behind `POST /settings/dry-run`: **Save stays disabled until the
current edit set has been replayed** against stored score vectors, and any input change
invalidates the result. Shipping a threshold slider without that is a guess with a
production blast radius.

## Sounds are admin-curated, not user-uploaded

Since 2026-08-08 there is no end-user upload path — a regular account cannot add to the
library at all. New sounds enter only via `POST /api/v1/admin/sounds` (single) or
`POST /api/v1/admin/sounds/import` (bulk, ≤100), both landing straight on `APPROVED`.

That makes `PENDING_REVIEW` a **legacy drain**, reachable only through the deprecated
`POST /api/v1/sounds` alias called without `autoApprove`. The Sounds page therefore defaults
its browse filter to `APPROVED` and presents itself as catalog curation rather than an inbox —
an operator who reads an empty pending queue as "nothing to do" has misunderstood the job. The
dashboard never calls the deprecated alias.

Two details the page takes care to get right:

- **A short page is not the end of the list.** Browse is Elasticsearch ids hydrated from
  Cassandra, and a row deleted between index and hydration is silently dropped, so a page can
  come back shorter than `pageSize` mid-list. "Load more" hides only on a **zero-row** batch.
- **`-1` in `/status-counts` is a sentinel**, not a count — it means the ES count for that
  status failed. It renders as an explicit failure state and raises an index-health warning.

**Archive vs. takedown** is a distinction the UI forces the operator to make: archive is a
catalog decision (retire from new adoption, leave existing posts alone); takedown is a
rights/safety decision that can additionally strip the audio from posts already using it. Both
land in `ARCHIVED`, so the takedown confirm shows `useCount` as the blast radius.
# hikma-admin
