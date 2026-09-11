# Backend logging for behavioural & UI issues

## Why a client→server channel at all

Postr is ~80% direct-to-Supabase: the browser reads and writes poster documents
without the Express API in the path. The backend is therefore **structurally
blind** to almost everything a user experiences — a save that never lands, an
undo that does nothing, text silently clipped out of a block. Access logs alone
cannot see any of it, because those requests never reach the API.

So the backend gets two things:

1. **A structured access log** — one line per API request.
2. **A diagnostics ingest endpoint** the client posts anomaly signals to.

Both write single-line JSON to stdout, which is what Render captures and what
makes `grep '"event":"ui.autosave_failed"'` workable in their log viewer.

## What was added

| File | Role |
|---|---|
| `apps/api/src/logger.ts` | The only place that writes to stdout. JSON lines, level filtering via `LOG_LEVEL`, bounded field sizes. |
| `apps/api/src/requestLog.ts` | One line per request, on finish, with duration. |
| `apps/api/src/diagnostics.ts` | `POST /v1/diagnostics/ui` — validates, dedups, rate-limits, logs. |
| `packages/shared/src/types/diagnostics.ts` | The signal taxonomy, shared so client and server cannot drift. |
| `apps/web/src/lib/diagnostics.ts` | Client emitter: queues, coalesces, flushes, never throws. |

## "Comprehensive but not redundant"

Comprehensiveness comes from the taxonomy covering each **distinct** failure
mode found in the stress test — nothing in it is derivable from anything else:

| Signal | Catches |
|---|---|
| `autosave_failed` | work not persisting; `attempt` + `sinceFirstMs` separate a blip from a real outage |
| `undo_exhausted` | F3 — history evicted, structural edit unrecoverable |
| `undo_noop` | F1 — an edit that was never recorded (`action` says which interaction) |
| `redo_unavailable` | F2 — redo dead after a text edit |
| `layout_defect` | F8 — text clipped, blocks overlapping, out of bounds |
| `fit_overflow` | F5 — poster clipped after "fit", with the geometry to reproduce |
| `paste_normalized` | F6 — paragraph boundaries dropped on paste |
| `client_error` | crashes; `deadEnd` flags a screen with no recovery control |
| `session_invalid` | F7 — valid JWT, unusable session |
| `duplicate_tab` | last-write-wins exposure |

Non-redundancy is **enforced in code**, not left to callers:

- **Emit on anomaly, not on action.** Normal editing produces *no* traffic.
- **Client coalescing** — identical signals in the 5 s flush window collapse to one.
- **Server dedup** — the same `(user, kind, sub-type, poster)` signature logs once
  per 60 s. Repeats increment a counter reported either as
  `suppressedSincePrevious` on that signature's next line, or as a standalone
  `ui.repeats_suppressed` line when the window closes first — the count is never
  silently lost, at any `dedupMs`.
- **Per-user hourly ceiling** (default 120 lines). Over-budget drops emit
  `ui.budget_exceeded` **at most once per user per hour**, routed through the same
  dedup map so the warning cannot itself become the biggest log consumer.
- **Rate limited** like every other authed route (12/min, 500/day), so request
  volume is bounded independently of the log budget.
- **Client-side TTL suppression** (60 s, matching the server window), so a
  condition persisting for an hour posts once rather than ~720 times.
- **Partial batches** — one malformed event is counted as `invalid`, not fatal;
  its valid siblings are still logged.
- **One line per request**, never per stage. `/health` never logs; the
  diagnostics route logs an access line only on failure, since it already
  records its own outcome on success.

## Privacy

Every field is a scalar count, pixel, millisecond or enum. No poster text, block
content, file names or tokens. Signals are validated against a
`discriminatedUnion` before logging, so a client bug cannot inject extra keys —
there is a test asserting exactly that. Signal fields are spread **before**
server-derived context, so a future field named `userId`/`surface`/`posterId`
cannot shadow the trusted value.

Error **messages are deliberately not forwarded**. Postgres/PostgREST messages
embed row values (`Key (title)=(…)`) and library errors serialise props into
their message, so the signal carries the error *name* and a classified reason
instead; full detail still goes to the console and Sentry.

Robustness: the logger's `write` is inside its try/catch (stdout on Render is a
pipe, and EPIPE inside a `res.on('finish')` listener would exit the process),
and the access-log listener body is itself wrapped.

## Verified end-to-end

With writes revoked on `posters` to force a genuine rejection, a real edit in the
browser produced one line:

```json
{"ts":"2026-09-11T05:17:13.242Z","level":"warn","event":"ui.autosave_failed",
 "userId":"ee64e9be…","anonymous":true,"surface":"poster-editor",
 "posterId":"2cf9863e…","attempt":2,"sinceFirstMs":102931,
 "reason":"permission_denied"}
```

Note what this catches: the user had **103 seconds of unsaved work**, and the
reason was `permission_denied` while the UI was telling them *"Save failed —
check your connection"*. The log contradicts the message the user was shown.

## Wired call sites

- `useAutosave` → `autosave_failed` (with consecutive-failure streak tracking)
- `EditorErrorBoundary` → `client_error` (`deadEnd: false`)
- `Editor` load-error screen → `session_invalid` / `client_error` (`deadEnd: true`)

**Not yet wired** — the emitter exists and the taxonomy is defined, but these
call sites still need hooking up: `undo_noop`, `undo_exhausted`,
`redo_unavailable` (posterStore / PosterEditor keydown), `fit_overflow`
(`useZoom` fit), `layout_defect` (pre-flight sweep), `paste_normalized`
(`RichTextEditor.handlePaste`), `duplicate_tab` (`useTwoTabGuard`).

## Operational notes

- `LOG_LEVEL` (`debug|info|warn|error`, default `info`). UI signals log at
  `warn`, so the default level surfaces them.
- The API **must be started with `apps/api` as cwd** or dotenv never loads
  `apps/api/.env` — CORS then silently falls back to defaults and the browser
  cannot reach the endpoint. This cost me a debugging cycle; worth a note in the
  run script.
- Diagnostics auth uses the same Supabase JWT check as other routes, so when
  Supabase itself is down the signal cannot be reported. That is an accepted
  limitation: the channel reports *app* failures, not total-outage failures.

## Local-stack caveat (not a product bug)

On a fresh local stack built from this repo's migrations with Supabase CLI
2.110, `anon` and `authenticated` come up **without** `select/insert/update/
delete` on `public` tables, so the app cannot read or write and every surface
shows `permission denied for table posters`. Hosted Supabase supplies those
grants via default privileges. To bootstrap locally:

```sql
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
```

Worth deciding whether to add an explicit grant migration so a fresh local
environment works without manual intervention.
