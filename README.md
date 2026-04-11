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
- **AI-powered poster scan** — upload a draft and get structured feedback (server-proxied)

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
- Anthropic API key (only if you want to run the scan feature)

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

# 5. Run the API (separate terminal, only needed for scan feature)
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
| `npm run db:types`       | Regenerate `packages/shared/src/database.types.ts`  |

## Database

Schema lives in `supabase/migrations/`. After editing migrations:

```bash
npm run db:reset     # apply migrations against local Supabase
npm run db:types     # regenerate typed client
```

Every user-owned table is protected by Row Level Security. See the migrations for the exact policies.

## Status

Pre-launch. The data model, editor, and auth flows are in place; polish and production hardening are in progress.

## License

Proprietary — all rights reserved.
