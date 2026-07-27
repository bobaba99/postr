# MCP server and public API

**Status:** planned, unscheduled. No timeline — captured so today's endpoints stop drifting
away from a shape either surface could expose. **Owner decision 2026-07-27:** build both
eventually; record the design now.

---

## 0. Two surfaces, two different users

They are routinely conflated. They are not the same product.

| | MCP server | Public REST API |
|---|---|---|
| Who | a researcher already in Claude / Cursor / an IDE | a lab admin, a core facility, a courseware team |
| Shape | conversational, one poster at a time | programmatic, batch, embedded |
| Value | **distribution** — Postr where people already work | **revenue** — justifies an institutional tier |
| Auth | OAuth 2.1, per-user, browser consent | API keys, per-organisation, revocable |
| Failure mode | a tool call that silently does the wrong thing | a quota surprise, or a breaking change at 3am |

**Both are the same core.** If the internal contract is right, each is a thin adapter over it.
That is the actual work, and it is the reason to write this down before either is built.

---

## 1. Where the code stands today

`apps/api/` currently exposes, all browser-facing and all unversioned:

| Route | Purpose |
|---|---|
| `GET /health` | liveness |
| `POST /api/import/extract` | vision import (poster image → structured), and the `extract-style` mode |
| `POST /api/narrative/condense` | manuscript condense (OpenAI) |
| `POST /cron/cleanup-anonymous-users` | scheduled job, shared-secret auth |

**What already generalises well.** `requireAuth` verifies a Bearer JWT via
`supabase.auth.getUser` and attaches the user — an API-key path can attach an equivalent
principal and every downstream handler keeps working. `createRateLimiter` already does a sliding
burst window plus a daily cap and **fails closed** when it cannot identify the caller, which is the
correct default for a public surface.

**What blocks exposure today, honestly listed:**

1. **No versioning.** Routes are `/api/...` with no `/v1`. The moment an external client exists,
   every response shape is frozen by accident.
2. **Rate-limit state is in-memory** — per process. Fine for one Render instance; wrong the moment
   there are two, and wrong for quota accounting a customer is billed against.
3. **The heavy work is client-side.** PPTX and LaTeX export, poster layout, and chart rendering all
   run in the browser (`apps/web/src/export/`, `src/charts/`). **An API that generates a file cannot
   reuse any of it as-is.** This is the single largest piece of work and §4 covers it.
4. **No idempotency.** A retried generation bills twice and returns two documents.
5. **Errors are shaped for a UI**, deliberately generic per the house rule. A machine client needs a
   stable `code` alongside the human message — those goals do not conflict, but the current shape
   only serves the first.

---

## 2. MCP server

### What it is for

A researcher in Claude says *"turn this manuscript into a conference poster"* and it happens,
without leaving the conversation. Postr becomes infrastructure rather than a destination.

**SEO note, measured 2026-07-27:** `mcp server` is **60,500/mo · KD 40** and `claude mcp server`
**1,300/mo · KD 27** — the largest winnable terms surfaced in any pull for this project. A real
`/mcp` documentation page is worth building for discovery alone, independent of usage. But the term
is navigational: people search it to find *a* server, so the page must be genuinely useful
documentation, not a landing page wearing docs clothing.

### Tools to expose

Deliberately few. An MCP server with thirty tools is unusable; the model cannot choose well.

| Tool | Does | Notes |
|---|---|---|
| `create_poster_from_manuscript` | text/.docx in → poster doc + share link | the flagship |
| `check_figure_readability` | plotting code or image → print-size verdict | **already deterministic** — zero marginal cost, no auth needed |
| `recommend_chart` | table/columns → ranked chart forms | also deterministic (`src/charts/`) |
| `get_conference_spec` | conference name → size, fonts, verified date | pure data lookup |
| `list_posters` / `get_poster` | read the user's own work | |

**Start with the deterministic three.** `check_figure_readability`, `recommend_chart` and
`get_conference_spec` need no model call, no per-request cost, and no quota — they can be free and
unauthenticated forever. They prove the integration and cost nothing. The generative tools come
after, behind auth.

### Auth

**OAuth 2.1 with PKCE, not API keys.** MCP clients are user-facing; a user pasting a secret into a
chat window is a bad pattern and the secret ends up in transcripts. Supabase already issues the
tokens; the MCP server exchanges an OAuth grant for a session and reuses `requireAuth` unchanged.

### The honest risks

- **A tool that silently does the wrong thing is worse than no tool.** The model may call
  `create_poster_from_manuscript` with a partial manuscript, or paste in someone else's paper. Every
  generative tool returns *what it did* in structured form — sections used, what was cut, warnings —
  so the model can surface it rather than reporting bare success.
- **Fidelity risk carries over.** The bake-off (presentation plan §5.1.5) showed cheap tiers invent
  content. An MCP tool that returns an invented statistic inside a chat is harder to catch than one
  in a UI with a source panel. **The verification layer is a prerequisite for the generative tools,
  not a follow-up.**
- **Cost with no UI to gate it.** A conversational client can loop. Per-user quotas must apply
  identically here, and the tool must say when a quota is exhausted rather than failing opaquely.

---

## 3. Public REST API

### Who actually pays

A lab automating posters for a cohort; a core facility embedding generation; a courseware team
adding it to a research-methods module. All institutional, all wanting a contract rather than a
chat.

Measured terms are tiny — `poster api` 20/mo, `slides api` 20/mo, `document generation api` 20/mo,
`powerpoint api` 50/mo · KD 2. **This is not an SEO play.** It is sold by direct contact and
justified by the institutional tier, and the pricing model (presentation plan §5.1) has no such
tier yet — that is a prerequisite, not a detail.

### Shape

```
POST   /v1/posters                 create from manuscript or spec  → 202 + job id
GET    /v1/posters/{id}            fetch (status, doc, warnings)
GET    /v1/posters/{id}/export     ?format=pptx|latex|pdf
POST   /v1/figures/readability     deterministic, cheap, high volume
POST   /v1/charts/recommend        deterministic
GET    /v1/conferences             reference data
```

**Non-negotiables for anything external:**

- **`/v1` from the first request.** Retrofitting a version prefix is a breaking change.
- **Async by default for generation.** Model calls take tens of seconds; a synchronous HTTP request
  that long is a timeout waiting to happen. Return `202` with a job id, poll or webhook.
- **Idempotency keys** on every POST that costs money. A retry must return the original result, not
  bill twice.
- **Stable error codes** (`invalid_manuscript`, `quota_exhausted`, `unsupported_format`) alongside
  the human message. The generic-message house rule is about *user-facing* copy; a machine client
  needs a code to branch on, and this does not weaken that rule.
- **Quota headers on every response** (`X-RateLimit-Remaining`, `X-Quota-Period-End`). Surprise
  exhaustion is the top complaint about metered APIs.

---

## 4. The shared prerequisite: server-side generation

**This is the real blocker for both surfaces and it is bigger than either.**

Poster layout, chart rendering, PPTX writing (`pptxgenjs`), LaTeX emission and figure readability
all run **in the browser**. An API request has no browser. Three options:

1. **Headless render service.** Run the existing client code under Playwright/Chromium on the
   server. Maximum reuse, exact parity with what users see, but a heavy always-on service — a real
   line item against the hosting costs in the presentation plan §5.1.2, where hosting already
   dominates below ~2k MAU.
2. **Extract the pure core into a shared package.** Much of it is already pure: `src/export/units.ts`,
   the LaTeX writer, `src/charts/recommend.ts`, `src/poster/readability.ts`, the manuscript mapper
   and rubric are all dependency-free computation. Move them to `packages/` and let both the web app
   and the API import them. **Cleanest, and the deterministic tools ship immediately** — the three
   free MCP tools in §2 need *only* this, no rendering at all.
3. **Client-side handoff.** The API returns a document model; the caller renders it. Cheapest, but
   an API that cannot produce a `.pptx` is not the product anyone is asking for.

**Recommendation: (2) now, (1) later and only if file output is genuinely demanded.** Option 2 is
worth doing on its own merits — the manuscript and chart logic being importable from `apps/api`
would have made the condense path simpler already, and it makes the free deterministic tools
essentially free to ship.

---

## 5. Open questions

1. **Institutional pricing does not exist.** §5.1 of the presentation plan covers individuals only.
   A public API needs a seat or volume tier before it can be sold, and that is a business decision,
   not an engineering one.
2. **Rate-limit state must move off-process** (Redis or Postgres) before either surface ships to
   more than one instance. Cheap to do, easy to forget, and silently wrong until it isn't.
3. **Does the free tier extend to MCP?** A generous free MCP tier is excellent distribution and a
   real cost (§5.1.2: the free path already spends money at scale). The deterministic tools are the
   honest answer — free forever, genuinely zero marginal cost.
4. **Terms of service and data handling.** An API that ingests unpublished manuscripts needs an
   explicit retention and training stance in writing. The `/s/` share-link privacy posture is the
   precedent, but a machine surface with institutional customers needs it stated far more plainly.
5. **Support expectations.** An institutional customer expects a response path. That is an
   operational commitment, and it is worth deciding *before* selling, not after.
