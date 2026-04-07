# Changelog

All notable changes to vikunja-mcp are documented here.

## [1.2.0] — 2026-04-07

### Added
- **`get_calendar_events` tool** — reads events from any number of local
  `.ics` files and remote webcal/https URLs. Events are expanded (including
  recurring rules), grouped by day, and returned with calendar name, time,
  and location. Configurable look-back and look-ahead window.
- **`weekly_review` calendar section** — when calendar sources are
  configured, the weekly review now opens with a `THIS WEEK'S CALENDAR`
  section so tasks and schedule are reviewed together in one call.
- **`CALENDAR_ICS_FILES` env var** — comma-separated paths to local `.ics`
  files (e.g. synced from CalDAV via vdirsyncer).
- **`CALENDAR_ICS_URLS` env var** — comma-separated webcal/https URLs for
  remote iCal subscriptions. `webcal://` is automatically converted to
  `https://`. Both vars are optional; calendar features are silently
  disabled when neither is set.

### Security
- **Removed unauthenticated `/calendar.ics` HTTP endpoint** — it exposed
  all tasks without auth. Use `get_calendar` or `get_calendar_events` tools
  instead.
- **Constant-time token comparison** — the `MCP_AUTH_TOKEN` check now uses
  `crypto.timingSafeEqual` to prevent timing-based token enumeration.
- **Path traversal protection** — `CALENDAR_ICS_FILES` paths are resolved
  and validated before being passed to the iCal parser.
- **SSRF protection** — `CALENDAR_ICS_URLS` entries are validated: only
  `https://` is allowed, and private/loopback IP ranges are blocked.
- **Error message hardening** — Vikunja API error bodies are now logged
  server-side only; clients receive only the HTTP status code.
- **Filter length cap** — `filter` parameters on `list_tasks`,
  `create_filter`, and `update_filter` are capped at 500 characters.

## [1.1.0] — 2026-04-06

### Added
- **`bulk_update_tasks` tool** — update any number of tasks in one call.
  Only specified fields are changed; unmentioned fields are left untouched.
- **`get_notifications` tool** — list all notifications with unread count.
- **`create_filter` / `get_filter` / `update_filter` / `delete_filter` tools**
  — full CRUD for saved filters. Saved filters appear alongside projects in
  Vikunja and can be used to recall named task views.
- **Token-based auth middleware** — the `/mcp` endpoint now checks for an
  optional `MCP_AUTH_TOKEN` env var. When set, every request must supply the
  token as a query parameter (`?token=…`) or the server returns `401
  Unauthorized`. Leave unset to disable auth (e.g. on a private network).
- **`get_calendar` tool** — agenda view of tasks with due dates, grouped by
  overdue / upcoming. Configurable look-ahead window (1–365 days) and optional
  overdue inclusion.
- **`GET /calendar.ics` endpoint** — RFC 5545-compliant iCal feed of all open
  tasks (plus tasks completed in the last 30 days). Subscribe with any calendar
  app via `webcal://<host>/calendar.ics`.
- **`create_relation` tool** — link two tasks with a typed relation
  (subtask, blocking, precedes, related, …).
- **`remove_relation` tool** — remove a previously created relation between
  two tasks.

### Fixed
- `remove_relation` was calling `DELETE /tasks/{id}/relations` with a request
  body — corrected to `DELETE /tasks/{id}/relations/{relationKind}/{otherTaskId}`
  as the API spec requires.
- `list_tasks` / `weekly_review` were targeting `GET /tasks/all` which does not
  exist in Vikunja v2; corrected to `GET /tasks`.
- `update_task` and `update_project` now fetch the current object before
  sending a partial update, preventing Vikunja's full-object replacement from
  zeroing out fields the caller did not mention (e.g. `complete_task` wiping
  `due_date` and `priority`).
- `weekly_review` was silently swallowing API errors via `.catch(() => [])`,
  making it appear to succeed with empty results. Now uses `Promise.allSettled`
  and surfaces per-section error messages.
- Date fields (`due_date`, `start_date`, `end_date`) no longer show
  Vikunja's zero-value sentinel `0001-01-01T00:00:00Z` as a real date.

### Changed
- TypeScript dev-dependency bumped from `^5.7.0` to `^5.9.3`.

## [1.0.0] — 2026-04-06

Initial release.

### Added
- MCP server over Streamable HTTP (stateless, no sessions).
- **Project tools:** `list_projects`, `get_project`, `create_project`,
  `update_project`, `delete_project`.
- **Task tools:** `list_tasks`, `get_task`, `create_task`, `update_task`,
  `delete_task`, `complete_task`, `reopen_task`.
- **Comment tool:** `add_comment`.
- **Label tools:** `list_labels`, `create_label`, `add_label_to_task`,
  `remove_label_from_task`.
- **Review tool:** `weekly_review` — overdue, due this week, high-priority
  open, and recently completed tasks in one call.
- `GET /health` endpoint for process monitoring.
- Supervisord + Uberspace deployment guide (`DEPLOY-UBERSPACE.md`).
