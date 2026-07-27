# Postr

Opinionated academic poster builder for students and researchers. Anonymous-first auth, autosave from the first keystroke, curated design constraints, and a seamless upgrade path to a permanent account without losing work.

## Features

- **Zero-friction start** — no signup gate; anonymous session is created on first visit
- **Autosave** — every edit persists; no "save" button anywhere
- **Constraint-driven design** — curated fonts, palettes, and layout presets tuned for academic posters
- **Structured authors & affiliations** — first-class data model, not freeform text
- **Reference management** — import from common formats, citation-style support
- **Greek-symbol shortcuts** — smart text entry for STEM content
- **Asset uploads** — figures, logos, stored per-user with RLS
- **Shareable links** — read-only slugs for advisors and co-authors
- **Poster import** — extract references and authors from an existing poster image into the structured model (server-proxied)

## Tech Stack

| Layer    | Choice                                           |
| -------- | ------------------------------------------------ |
| Frontend | Vite + React 18 + TypeScript (SPA)               |
| Styling  | Tailwind CSS + CSS variables                     |
| State    | Zustand + React Query                            |
| Routing  | React Router v6                                  |
| Backend  | Supabase (Auth, Postgres, Storage, RLS)          |
| API      | Express + TypeScript (LLM proxy only)            |
| LLM      | Anthropic Claude (server-side, never in browser) |
| Export   | Browser print (v1)                               |

## Repository Layout

```text
postr/
├── apps/
│   ├── web/        # Vite + React SPA (main user-facing app)
│   └── api/        # Express TypeScript server (LLM proxy)
├── packages/
│   └── shared/     # Typed data model + generated DB types
├── supabase/       # Migrations, seed, edge functions, config
└── docs/           # Internal product + engineering docs
```

Architecturally, ~80% of traffic goes directly from browser to Supabase via RLS-protected queries. The Express API exists only to hold secrets (LLM API keys) the browser cannot safely hold.

## Prerequisites

- Node.js 20+ and npm 10+
- A Supabase project (local via `supabase start`, or a remote project)
- Anthropic API key (only if you want to run the import feature)

## Getting Started

```bash
# 1. Install workspace dependencies
npm install

# 2. Configure environment variables
cp apps/api/.env.example apps/api/.env
# Create apps/web/.env with VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_API_BASE_URL

# 3. (Optional) Start the local Supabase stack
npm run db:start

# 4. Run the web app
npm run dev            # http://localhost:5173

# 5. Run the API (separate terminal, only needed for import feature)
npm run dev:api        # http://localhost:8787
```

### Environment Variables

**`apps/web/.env`** — browser bundle, must use `VITE_` prefix:

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_API_BASE_URL=http://localhost:8787
```

**`apps/api/.env`** — server-only, never exposed to the browser:

```dotenv
PORT=8787
CORS_ORIGINS=http://localhost:5173
SUPABASE_URL=
SUPABASE_SECRET_KEY=
ANTHROPIC_API_KEY=
```

Never commit `.env` files. See `apps/api/.env.example` for the canonical shape.

## Scripts

| Command                  | What it does                                        |
|--------------------------|-----------------------------------------------------|
| `npm run dev`            | Start the web app (Vite dev server)                 |
| `npm run dev:api`        | Start the Express API                               |
| `npm run build`          | Build all workspaces                                |
| `npm run test`           | Run all workspace tests                             |
| `npm run lint`           | Lint all workspaces                                 |
| `npm run db:start`       | Start the local Supabase stack                      |
| `npm run db:stop`        | Stop the local Supabase stack                       |
| `npm run db:reset`       | Reset the local database                            |
| `npm run db:test`        | Reset the local database, then run the SQL tests    |
| `npm run db:types`       | Regenerate `packages/shared/src/database.types.ts`  |

## Database

Schema lives in `supabase/migrations/`. After editing migrations:

```bash
npm run db:reset     # apply migrations against local Supabase
npm run db:types     # regenerate typed client
```

Every user-owned table is protected by Row Level Security. See the migrations for the exact policies.

### SQL tests (pgTAP)

The SQL RPCs (`export_my_data()`, `delete_own_account()`, the rate-limit
triggers) are tested at the database level — PL/pgSQL bodies are only
syntax-checked at `CREATE` time, so a broken column reference inside a
function applies cleanly and fails only at runtime. The pgTAP suite in
`supabase/tests/` catches that class of bug.

```bash
npm run db:test      # supabase db reset && supabase test db
```

Requires Docker and a running local stack (`npm run db:start`, or just
`supabase db start` for Postgres alone). Each test file is a single
transaction that rolls back at the end, so the suite leaves the local
database untouched. The same suite runs in CI against a throwaway
Postgres container — local-stack default credentials only, no secrets.
CI skips the reset on purpose: a fresh `supabase db start` already applies
every migration, while the local script resets first because a long-lived
dev stack may be behind on migrations.

## Status

Pre-launch. The data model, editor, and auth flows are in place; polish and production hardening are in progress.

## License

Proprietary — all rights reserved.
