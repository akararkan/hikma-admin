// Complete admin API surface (~250 endpoints) — one namespace per domain.
// Paths and payload shapes follow docs/admin/api/* exactly.
import { api, get, post, put, patch, del, BASE } from './client'

/**
 * Resolve a media link that came back from the server for use in an <audio>/<img> tag.
 * Files we host are stored as media-proxy links, and the server emits them relative
 * (e.g. `/api/v1/media/sounds/audio/…`) whenever no absolute media prefix is configured.
 * A relative link would resolve against the dashboard's own origin, which is wrong as soon
 * as the dashboard talks to the backend cross-origin (VITE_API_BASE). Links that already
 * carry a scheme — CDN links pasted by hand — are returned untouched.
 */
export const mediaUrl = (u) => (!u || /^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith('//') ? u : BASE + u)

/* ================= Auth & step-up ================= */
export const AuthApi = {
  login: (username, password) => post('/api/v1/auth/login', { username, password }, { auth: false, allowStepUp: false }),
  // Leg 2 of a two-factor login. `code` takes the 6-digit authenticator code OR a
  // single-use recovery code — the server tries TOTP first, then recovery.
  loginTwoFactor: (mfaToken, code) => post('/api/v1/auth/login/2fa', { mfaToken, code }, { auth: false, allowStepUp: false }),
  refresh: (refreshToken) => post('/api/v1/auth/refresh', { refreshToken }, { auth: false, allowStepUp: false }),
  logout: () => post('/api/v1/auth/logout', undefined, { allowStepUp: false }),
  logoutAll: () => post('/api/v1/auth/logout-all', undefined, { allowStepUp: false }),
  // arm the step-up window: {password} or {code}
  stepUp: (body) => post('/api/v1/security/step-up', body, { allowStepUp: false }),
}

/* ================= Users & roles (AdminUserController, 32 routes) ================= */
const U = '/api/v1/admin/users'
export const UsersApi = {
  list: (params) => get(U, params), // q, role, status, verified, from, to, page, size
  detail: (id) => get(`${U}/${id}`),
  pii: (id) => get(`${U}/${id}/pii`),
  create: (body) => post(U, body),
  edit: (id, body) => patch(`${U}/${id}`, body),
  passwordReset: (id, body) => post(`${U}/${id}/password/reset`, body || {}),
  twoFaReset: (id, reason) => post(`${U}/${id}/2fa/reset`, { reason }),
  emailVerify: (id) => post(`${U}/${id}/email/verify`),
  changeRole: (id, role, reason) => patch(`${U}/${id}/role`, { role, reason }),
  disable: (id, reason) => post(`${U}/${id}/disable`, { reason }),
  enable: (id) => post(`${U}/${id}/enable`),
  lock: (id, reason) => post(`${U}/${id}/lock`, { reason }),
  unlock: (id) => post(`${U}/${id}/unlock`),
  sessions: (id) => get(`${U}/${id}/sessions`),
  revokeSession: (id, sid) => del(`${U}/${id}/sessions/${sid}`),
  revokeAllSessions: (id) => post(`${U}/${id}/sessions/revoke-all`),
  deletionRequest: (id, reason) => post(`${U}/${id}/deletion/request`, { reason }),
  deletionCancel: (id) => post(`${U}/${id}/deletion/cancel`),
  purgeNow: (id) => post(`${U}/${id}/purge/now`),
  purgeHold: (id, days) => api(`${U}/${id}/purge/hold`, { method: 'POST', params: { days } }),
  loginEvents: (id, params) => get(`${U}/${id}/login-events`, params),
  settingsAudit: (id, params) => get(`${U}/${id}/settings-audit`, params),
  moderation: (id) => get(`${U}/${id}/moderation`),
  data: (id) => get(`${U}/${id}/data`),
  analytics: (window) => get(`${U}/analytics`, { window }),
  issueStrike: (id, body) => post(`${U}/${id}/strikes`, body), // {reportId?, reason}
  bulkCreate: (rows) => post(`${U}/bulk`, { rows }),
  bulkAction: (body) => post(`${U}/bulk-action`, body), // {ids, action, role?, reason?}
  invite: (email, role) => post(`${U}/invite`, { email, role }),
  inviteResend: (inviteId) => post(`${U}/invite/${inviteId}/resend`),
  inviteRevoke: (inviteId) => del(`${U}/invite/${inviteId}`),
  impersonate: (id, reason) => post(`${U}/${id}/impersonate`, { reason }),
  endImpersonation: () => del('/api/v1/admin/impersonation'),
}

/* ================= Content moderation (AdminContentController) ================= */
const C = '/api/v1/admin/content'
export const ContentApi = {
  posts: (params) => get(`${C}/posts`, params), // authorId!, status, cursor, pageSize
  post: (postId) => get(`${C}/posts/${postId}`),
  removePost: (postId, body) => post(`${C}/posts/${postId}/remove`, body || {}),
  restorePost: (postId) => post(`${C}/posts/${postId}/restore`),
  deleteComment: (commentId, body) => del(`${C}/comments/${commentId}`, body || {}),
  deleteStory: (storyId, body) => del(`${C}/stories/${storyId}`, body || {}),
  unpinHighlight: (highlightId, storyId, body) => del(`${C}/highlights/${highlightId}/stories/${storyId}`, body || {}),
  blocklist: () => get(`${C}/blocklist`),
  blocklistAdd: (body) => post(`${C}/blocklist`, body), // {keyword, severity, note}
  blocklistUpdate: (id, body) => patch(`${C}/blocklist/${id}`, body),
  blocklistDelete: (id) => del(`${C}/blocklist/${id}`),
  blocklistTest: (text) => post(`${C}/blocklist/test`, { text }),
}

/* ================= Unified moderation queue + bulk ================= */
const M = '/api/v1/admin/moderation'
export const ModerationApi = {
  queue: (params) => get(`${M}/queue`, params), // source, targetType, page, pageSize
  resolveKeywordHit: (hitId) => post(`${M}/queue/keywords/${hitId}/resolve`),
  bulk: (body) => post(`${M}/bulk`, body), // {action, targets[{type,id}], reason}
}

/* ================= Automated text moderation — review queue (AdminAutoModerationController) =================
   The classifier's queue. Deliberately NOT the reports inbox above: that one asks "was this report
   valid?" about live content; this one asks "is this over the line?" about content nobody but its
   author has seen, so deciding it releases or buries rather than takes down.
   ADMIN, MODERATOR (metrics also ANALYST). Docs: docs/moderation/api.md §1. */
export const AutoModApi = {
  // status(IN_REVIEW) | entityType | slaBreached | sort(risk|oldest) | page | pageSize
  review: (params) => get(`${M}/review`, params),
  case: (caseId) => get(`${M}/review/${caseId}`),
  decide: (caseId, body) => post(`${M}/review/${caseId}/decide`, body), // {action: APPROVE|REJECT, reason, teachModel} — no step-up
  bulk: (body) => post(`${M}/review/bulk`, body),                       // {action, caseIds[1..100], reason, teachModel} — step-up
  rescore: (caseId) => post(`${M}/review/${caseId}/rescore`),
  metrics: (windowHours) => get(`${M}/review/metrics`, { windowHours }),
}

/* ================= Automated moderation — policy settings (AdminModerationSettingsController) =================
   ADMIN, MODERATOR; the raw/reset kill-switch layer is ADMIN only. */
export const AutoModSettingsApi = {
  settings: () => get(`${M}/settings`),                                  // overrides + resolved `effective` + model health
  thresholds: (entityType) => get(`${M}/settings/thresholds`, { entityType }),
  putThresholds: (body) => put(`${M}/settings/thresholds`, body),        // {entityType?, labels:{label:{low?,high?}}} — step-up
  putHoldDurations: (body) => put(`${M}/settings/hold-durations`, body), // {entityType?, holdMs?, inlineMs?, fallback?, enabled?} — step-up
  dryRun: (body) => post(`${M}/settings/dry-run`, body),                 // {entityType, labels, caseIds?} — replays stored scores, writes nothing
  putRaw: (key, value) => put(`${M}/settings/raw`, { key, value }),      // ADMIN — step-up
  deleteRaw: (key) => del(`${M}/settings/raw/${encodeURIComponent(key)}`), // ADMIN — step-up
  reset: () => post(`${M}/settings/reset`),                              // ADMIN — step-up; drops every override
}

/* ================= Automated moderation — dataset & model registry (AdminModerationModelController) =================
   ADMIN class-level; dataset reads/writes also MODERATOR, `versions` also ANALYST. */
export const AutoModModelApi = {
  examples: (params) => get(`${M}/model/training-examples`, params),     // source, page, pageSize
  addExample: (body) => post(`${M}/model/training-examples`, body),      // {text, labels, note} — dedup on normalized SHA-256
  addWord: (body) => post(`${M}/model/training-examples/word`, body),    // {word, labels, note} — expanded server-side
  deleteExample: (id) => del(`${M}/model/training-examples/${id}`),
  // CSV bulk import (multipart, step-up): kind=sentences|words; dryRun tests without saving;
  // allowPartial keeps good rows when some rows are bad. Word rows with blocklist=yes also
  // land on the platform blocklist.
  importExamples: (file, { kind, dryRun, allowPartial } = {}) => {
    const fd = new FormData()
    fd.append('file', file)
    if (kind) fd.append('kind', kind)
    if (dryRun != null) fd.append('dryRun', String(dryRun))
    if (allowPartial != null) fd.append('allowPartial', String(allowPartial))
    return api(`${M}/model/training-examples/import`, { method: 'POST', body: fd })
  },
  goldenCases: (params) => get(`${M}/model/golden-cases`, params),
  addGoldenCase: (body) => post(`${M}/model/golden-cases`, body),        // ADMIN
  deleteGoldenCase: (id) => del(`${M}/model/golden-cases/${id}`),        // ADMIN
  versions: (params) => get(`${M}/model/versions`, params),
  retrain: (body) => post(`${M}/model/retrain`, body || {}),             // {baseVersion?, notes} — step-up, 202
  retrainRefresh: () => post(`${M}/model/retrain/refresh`),
  promote: (id, force) => post(`${M}/model/versions/${id}/promote`, { force: !!force }), // step-up; reloads container first
  shadow: (id) => post(`${M}/model/versions/${id}/shadow`),
  rollback: () => post(`${M}/model/rollback`),                           // step-up; re-promotes the newest RETIRED
  scoreProbe: (text) => post(`${M}/model/score-probe`, { text }),        // ADMIN | MODERATOR
}

/* ================= Safety & reports (AdminSafetyController) ================= */
const S = '/api/v1/admin/safety'
export const SafetyApi = {
  reports: (params) => get(`${S}/reports`, params), // state, targetType, reason, page, pageSize
  report: (id) => get(`${S}/reports/${id}`),
  triage: (id, body) => post(`${S}/reports/${id}/triage`, body || {}),
  dismiss: (id, body) => post(`${S}/reports/${id}/dismiss`, body || {}),
  action: (id, body) => post(`${S}/reports/${id}/action`, body), // {resolution, note?, issueStrike?, strikeReason?, wholeGroup?}
  appealUphold: (reportId, note) => post(`${S}/appeals/${reportId}/uphold`, { note }),
  appealReverse: (reportId, note) => post(`${S}/appeals/${reportId}/reverse`, { note }),
  issueStrike: (userId, body) => post(`${S}/users/${userId}/strikes`, body), // {reportId?, reason}
  revokeStrike: (strikeId, note) => del(`${S}/strikes/${strikeId}`, { note }),
  strikes: (params) => get(`${S}/strikes`, params), // userId, active, page, size
  userRecord: (userId) => get(`${S}/users/${userId}/record`),
  consent: (userId, params) => get(`${S}/users/${userId}/consent`, params), // scope? | page,size
  blockStats: (params) => get(`${S}/stats/blocks`, params), // days, top
  analytics: (params) => get(`${S}/analytics`, params), // from, to
}

/* ================= Audit log (AuditLogController) ================= */
const AU = '/api/v1/admin/audit'
export const AuditApi = {
  search: (params) => get(AU, params), // userId!, operation, outcome, from, to, pageSize, cursor
  byUser: (userId, params) => get(`${AU}/users/${userId}`, params),
  byResource: (type, id, params) => get(`${AU}/resources/${type}/${id}`, params),
}

/* ================= Research (AdminResearchController) ================= */
const R = '/api/v1/admin/research'
export const ResearchApi = {
  list: (params) => get(R, params), // status, researcherId, ircId, q, page, size
  top: (params) => get(`${R}/top`, params), // by=downloads|citations
  flags: (params) => get(`${R}/flags`, params),
  detail: (id) => get(`${R}/${id}`),
  downloads: (id, limit) => get(`${R}/${id}/downloads`, { limit }),
  unpublish: (id, reason) => post(`${R}/${id}/unpublish`, { reason }),
  retract: (id, reason) => post(`${R}/${id}/retract`, { reason }),
  remove: (id, reason) => del(`${R}/${id}`, { reason }),
  flag: (id, body) => post(`${R}/${id}/flags`, body), // {type, note}
  resolveFlag: (flagId, reason) => post(`${R}/flags/${flagId}/resolve`, { reason }),
}

/* ================= QnA (AdminQnaController) ================= */
const Q = '/api/v1/admin/qna'
export const QnaApi = {
  questions: (params) => get(`${Q}/questions`, params), // status, authorId, q, unanswered, lockedOnly, page, size
  close: (id, reason) => post(`${Q}/questions/${id}/close`, { reason }),
  reopen: (id) => post(`${Q}/questions/${id}/reopen`),
  archive: (id) => post(`${Q}/questions/${id}/archive`),
  deleteQuestion: (id, reason) => del(`${Q}/questions/${id}`, { reason }),
  deleteAnswer: (answerId, reason) => del(`${Q}/answers/${answerId}`, { reason }),
}

/* ================= Trending overrides + tag maintenance ================= */
const TR = '/api/v1/admin/trending'
export const TrendingApi = {
  overrides: (active) => get(`${TR}/overrides`, { active }),
  createOverride: (body) => post(`${TR}/overrides`, body), // {tag, scope?, type, rank?, expiresAt?, reason?}
  deleteOverride: (id) => del(`${TR}/overrides/${id}`),
  rebuild: () => post(`${TR}/rebuild`),
}
const TG = '/api/v1/admin/tags'
export const TagsApi = {
  backfillPosts: () => post(`${TG}/backfill-posts`),
  hide: (tag, scope) => api(`${TG}/${encodeURIComponent(tag)}/hide`, { method: 'POST', params: { scope } }),
  unhide: (tag, scope) => api(`${TG}/${encodeURIComponent(tag)}/hide`, { method: 'DELETE', params: { scope } }),
  merge: (from, to) => api(`${TG}/merge`, { method: 'POST', params: { from, to } }),
}

/* ================= Knowledge vocabulary ================= */
const K = '/api/v1/admin/knowledge'
export const KnowledgeApi = {
  topics: () => get(`${K}/topics`),
  madhhabs: () => get(`${K}/madhhabs`),
  addTopic: (body) => post(`${K}/topics`, body),
  addMadhhab: (body) => post(`${K}/madhhabs`, body),
  editTopic: (id, body) => patch(`${K}/topics/${id}`, body),
  editMadhhab: (id, body) => patch(`${K}/madhhabs/${id}`, body),
  retireTopic: (id) => post(`${K}/topics/${id}/retire`),
  retireMadhhab: (id) => post(`${K}/madhhabs/${id}/retire`),
  evictCache: () => post(`${K}/cache/evict`),
}

/* ================= Chat metadata (AdminChatController) ================= */
const CH = '/api/v1/admin/chat'
export const ChatApi = {
  conversations: (params) => get(`${CH}/conversations`, params), // type, q, ownerId, includeDeleted, page, size
  overview: () => get(`${CH}/overview`),
  messageRequestStats: (params) => get(`${CH}/message-requests/stats`, params),
}

/* ================= Channels (AdminChannelController) ================= */
const CN = '/api/v1/admin/channels'
export const ChannelsApi = {
  list: (params) => get(CN, params), // q, verified, public, category, ownerId, includeDeleted, page, size
  detail: (id) => get(`${CN}/${id}`),
  stats: (id) => get(`${CN}/${id}/stats`),
  setVerified: (id, verified) => api(`${CN}/${id}/verified`, { method: 'PATCH', params: { verified } }),
  takedown: (id, body) => post(`${CN}/${id}/takedown`, body || {}),
  restore: (id) => post(`${CN}/${id}/restore`),
  unlist: (id, body) => post(`${CN}/${id}/unlist`, body || {}),
  freeze: (id, body) => post(`${CN}/${id}/freeze`, body || {}),
  unfreeze: (id) => post(`${CN}/${id}/unfreeze`),
  inviteLinks: (id) => get(`${CN}/${id}/invite-links`),
  revokeInvite: (id, inviteId, body) => post(`${CN}/${id}/invite-links/${inviteId}/revoke`, body || {}),
}

/* ================= Legal holds (LegalHoldController) ================= */
const LH = '/api/v1/admin/chat/legal-holds'
export const LegalHoldsApi = {
  list: (params) => get(LH, params), // status, page, size
  open: (conversationId, reason) => post(LH, { conversationId, reason }),
  approve: (id, note) => post(`${LH}/${id}/approve`, note ? { note } : {}),
  reject: (id, note) => post(`${LH}/${id}/reject`, note ? { note } : {}),
  execute: (id) => post(`${LH}/${id}/execute`),
}

/* ================= Sounds (AdminSoundController) =================
   ADMIN or MODERATOR at the class level; takedown and hard-delete additionally step up.
   Sounds are admin-curated only since 2026-08-08 — `create` and `importOfficial` are the only
   ways into the library and both land straight on APPROVED. The legacy `POST /api/v1/sounds`
   upload alias is deprecated and deliberately absent here: the dashboard must not call it. */
const SN = '/api/v1/admin/sounds'
export const SoundsApi = {
  // {title!, audioUrl!, artistName?, coverArtUrl?, durationSeconds?, category=PLATFORM_MUSIC, official=false}
  create: (body) => post(SN, body), // 201 → AdminSoundRow, always status=APPROVED
  // Multipart variant of `create`: the audio bytes themselves (+ optional cover image) instead of a
  // URL. Bytes land in R2 under sounds/; the row stores media-proxy URLs, so the picker streams them
  // with range support. Same result as `create` — 201 → AdminSoundRow, status=APPROVED.
  // meta: {title!, artistName?, durationSeconds?, category?, official?}
  upload: (file, cover, meta = {}) => {
    const fd = new FormData()
    fd.append('file', file)
    if (cover) fd.append('cover', cover)
    for (const k of ['title', 'artistName', 'durationSeconds', 'category', 'official']) {
      const v = meta[k]
      if (v !== undefined && v !== null && v !== '') fd.append(k, String(v))
    }
    return api(SN + '/upload', { method: 'POST', body: fd })
  },
  list: (params) => get(SN, params), // status, uploaderId, cursor, pageSize
  statusCounts: () => get(`${SN}/status-counts`),
  byUploader: (userId, params) => get(`${SN}/uploaders/${userId}`, params),
  detail: (id) => get(`${SN}/${id}`),
  approve: (id) => post(`${SN}/${id}/approve`),
  reject: (id, body) => post(`${SN}/${id}/reject`, body || {}), // {reasonCode, note}
  archive: (id, reason) => post(`${SN}/${id}/archive`, { reason }),
  restore: (id, reason) => post(`${SN}/${id}/restore`, { reason }),
  takedown: (id, body) => post(`${SN}/${id}/takedown`, body || {}), // {reason, muteAdoptingPosts, rightsClaimId}
  hardDelete: (id, reason) => del(`${SN}/${id}`, { reason }),
  setCategory: (id, category) => post(`${SN}/${id}/category`, { category }),
  edit: (id, body) => patch(`${SN}/${id}`, body), // {title?, artistName?, coverArtUrl?}
  importOfficial: (items) => post(`${SN}/import`, { items }),
  trendingExclude: (id, excluded) => post(`${SN}/${id}/trending-exclude`, { excluded }),
  trending: (params) => get(`${SN}/trending`, params), // days, limit
}

/* ================= Media + storage ================= */
const MD = '/api/v1/admin/media'
export const MediaApi = {
  list: (params) => get(MD, params), // status, type, ownerId, from, to, page, size
  detail: (assetId) => get(`${MD}/${assetId}`),
  reprocess: (assetId) => post(`${MD}/${assetId}/reprocess`),
  remove: (assetId, reason) => del(`${MD}/${assetId}`, { reason }),
  purgeRawRun: (dryRun) => api(`${MD}/purge-raw/run`, { method: 'POST', params: { dryRun } }),
  reconcile: (params) => api(`${MD}/reconcile`, { method: 'POST', params }), // prefix, dryRun, maxObjects
  quotas: () => get(`${MD}/quotas`),
  setQuota: (role, body) => put(`${MD}/quotas/${role}`, body), // {dailyUploads?, dailyBytes?, enabled?}
  statusSummary: () => get(`${MD}/status-summary`),
  ops: () => get(`${MD}/ops`),
}
export const StorageApi = {
  usage: (top) => get('/api/v1/admin/storage/usage', { top }),
}

/* ================= Notifications & announcements ================= */
const N = '/api/v1/admin/notifications'
export const NotificationsApi = {
  stats: (params) => get(`${N}/stats`, params), // from, to
  types: () => get(`${N}/types`),
  compose: (body) => post(`${N}/announcements`, body),
  announcements: (params) => get(`${N}/announcements`, params),
  cancelAnnouncement: (id) => del(`${N}/announcements/${id}`),
  digestRun: () => post(`${N}/digest/run`), // takes no params — always runs for the current day
  emailStats: (params) => get(`${N}/email/stats`, params), // from, to, tail
  emailTest: (subject, body) => post(`${N}/email/test`, { subject, body }),
  purgePushToken: (id) => del(`${N}/push-tokens/${id}`),
}

/* ================= Logs (AdminLogsController) ================= */
const L = '/api/v1/admin/logs'
export const LogsApi = {
  explore: (params) => get(`${L}/explore`, params), // q | store,userId,ip,outcome,since,until,text,pageSize
  loginEvents: (params) => get(`${L}/login-events`, params),
  exportCsv: (query) => api(`${L}/export`, { method: 'POST', body: { query }, blob: true }),
  views: () => get(`${L}/views`),
  saveView: (name, query) => post(`${L}/views`, { name, query }),
  deleteView: (id) => del(`${L}/views/${id}`),
  alerts: () => get(`${L}/alerts`),
  createAlert: (body) => post(`${L}/alerts`, body),
  updateAlert: (id, body) => patch(`${L}/alerts/${id}`, body),
  deleteAlert: (id) => del(`${L}/alerts/${id}`),
  firings: (params) => get(`${L}/alerts/firings`, params), // since, ruleId, page, size
  retention: () => get(`${L}/retention`),
  otpStats: (params) => get(`${L}/otp-stats`, params), // windowHours, burstThreshold
}

/* ================= Analytics ================= */
const AN = '/api/v1/admin/analytics'
export const AnalyticsApi = {
  overview: () => get(`${AN}/overview`),
  content: (window) => get(`${AN}/content`, { window }),
  engagement: (window) => get(`${AN}/engagement`, { window }),
  trending: (scope, limit) => get(`${AN}/trending`, { scope, limit }),
  series: (metric, window) => get(`${AN}/series`, { metric, window }),
  funnel: (cohort) => get(`${AN}/funnel`, { cohort }),
  retention: (weeks) => get(`${AN}/retention`, { weeks }),
  rollupRun: (date) => post(`${AN}/rollup/${date}/run`),
  backfill: (from, to) => api(`${AN}/backfill`, { method: 'POST', params: { from, to } }),
  eventsSample: (params) => get(`${AN}/events/sample`, params), // day, type, limit
  alertsConfig: () => get(`${AN}/alerts-config`),
  setAlert: (metric, body) => put(`${AN}/alerts/${metric}`, body), // {zWarn, zAlert, minVolume, enabled}
  anomalies: (params) => get(`${AN}/anomalies`, params),
  exportCsv: (dataset, window) => api(`${AN}/export`, { params: { dataset, window }, blob: true }),
}

/* ================= Feed tuning + PYMK ================= */
const F = '/api/v1/admin/feed'
export const FeedApi = {
  weights: () => get(`${F}/weights`),
  explain: (userId, limit) => get(`${F}/explain/${userId}`, { limit }),
  affinity: (userId, limit) => get(`${F}/affinity/${userId}`, { limit }),
  config: () => get(`${F}/config`),
  patchConfig: (body) => patch(`${F}/config`, body),
  preview: (body) => post(`${F}/preview`, body), // {userId, limit?, overrides?}
}
const SG = '/api/v1/admin/suggestions'
export const SuggestionsApi = {
  knobs: () => get(`${SG}/knobs`),
  explain: (userId) => get(`${SG}/explain/${userId}`),
}

/* ================= Search ops + reindexes ================= */
const SE = '/api/v1/admin/search'
export const SearchApi = {
  indices: () => get(`${SE}/indices`),
  health: () => get(`${SE}/health`),
  topQueries: (params) => get(`${SE}/analytics/top-queries`, params), // scope, days, limit
  zeroResults: (params) => get(`${SE}/analytics/zero-results`, params),
  reindex: (entity, drop) => api(`${SE}/${entity}/reindex`, { method: 'POST', params: { drop } }),
  reindexAll: () => post(`${SE}/reindex-all`),
}
export const REINDEX_ENTITIES = ['research', 'posts', 'questions', 'users', 'channels', 'answers', 'sounds']

/* ================= Operations (AdminOpsController) ================= */
const O = '/api/v1/admin/ops'
export const OpsApi = {
  health: () => get(`${O}/health`),
  sse: () => get(`${O}/sse`),
  jobs: () => get(`${O}/jobs`),
  jobRuns: (jobKey, params) => get(`${O}/jobs/${jobKey}/runs`, params),
  runJob: (jobKey) => post(`${O}/jobs/${jobKey}/run`),
  pauseJob: (jobKey) => post(`${O}/jobs/${jobKey}/pause`),
  resumeJob: (jobKey) => post(`${O}/jobs/${jobKey}/resume`),
  pausedJobs: () => get(`${O}/jobs/paused`),
  queues: () => get(`${O}/queues`),
  dlq: (params) => get(`${O}/queues/dlq`, params), // status, routingKey, page, size
  dlqRequeue: (id) => post(`${O}/queues/dlq/${id}/requeue`),
  dlqDiscard: (id) => del(`${O}/queues/dlq/${id}`),
  redis: () => get(`${O}/redis`),
  redisFlush: (prefix) => api(`${O}/redis/keys`, { method: 'DELETE', params: { prefix } }),
  config: () => get(`${O}/config`),
  reconciler: () => get(`${O}/config/reconciler`),
  chatBackfill: () => post(`${O}/es/chat-messages/backfill`),
}

/* ================= Break-glass activity (AdminActivityController) ================= */
const A = '/api/v1/admin'
export const ActivityApi = {
  openCase: (targetUserId, body) => post(`${A}/breakglass/${targetUserId}`, body), // {kind, reason, caseRef?}
  approveCase: (caseId) => post(`${A}/breakglass/cases/${caseId}/approve`),
  closeCase: (caseId) => post(`${A}/breakglass/cases/${caseId}/close`),
  cases: (params) => get(`${A}/breakglass/cases`, params),
  activity: (userId, params) => get(`${A}/users/${userId}/activity`, params), // types, from, to, size
  summary: (userId, window) => get(`${A}/users/${userId}/activity/summary`, { window }),
  reelsWatched: (userId, params) => get(`${A}/users/${userId}/reels/watched`, params),
  exportActivity: (userId, params) => api(`${A}/users/${userId}/activity/export`, { params, blob: true }),
  erase: (userId, body) => post(`${A}/users/${userId}/activity/erase`, body || {}), // {type?, reason?}
}

/* ================= Discovery / PYMK oversight ================= */
export const DiscoveryApi = {
  recompute: (userId) => post(`${A}/users/${userId}/suggestions/recompute`),
  suggestions: (userId) => get(`${A}/users/${userId}/suggestions`),
  contactSyncStats: () => get(`${A}/discovery/contact-sync/stats`),
  compliance: (scanLimit) => get(`${A}/discovery/contact-sync/compliance`, { scanLimit }),
  purgeHashes: (userId) => post(`${A}/users/${userId}/contact-hashes/purge`),
  flags: (userId) => get(`${A}/users/${userId}/discovery`),
  rotateQr: (userId) => post(`${A}/users/${userId}/qr/rotate`),
}
