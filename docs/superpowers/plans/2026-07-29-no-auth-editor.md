# No-auth Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A logged-out visitor clicks "Editor" and edits a poster immediately on a silent anonymous session; they're prompted to create a permanent account only on export or leave, and the poster carries over on conversion.

**Architecture:** The editor already runs on an anonymous session (the existing "guest" flow). This removes the visible `/auth?guest=1` detour: a new `EnsureSession` wrapper replaces `AuthGuard` on `/p/:posterId` and silently creates an anonymous session; `PosterEditor`, autosave, and all persistence are untouched. Two prompts (export click, leave) fire only for anonymous+edited sessions via a shared `SecureWorkModal` that routes into the existing convert-in-place flow.

**Tech Stack:** React, react-router, Supabase (anonymous auth + `updateUser`/`linkIdentity`), Zustand store, Vitest + @testing-library/react (`render`, `renderHook`), npm workspaces.

## Global Constraints

- **Test runner:** `cd apps/web && npx vitest run <path>`. Coverage ≥ 80%.
- **Worktree caveat:** this worktree has no `node_modules` and `tsc` from here resolves `@postr/shared` to the MAIN checkout (predating this branch). Vitest is the authoritative check (it transpiles the real worktree source). For a real type-check, use a probe tsconfig that maps `@postr/shared` → `../../packages/shared/src/*` (pattern below). CI re-runs `tsc` on merge.
- **`.env`:** the worktree needs `apps/web/.env` with dummy Supabase vars for tests to import supabase-touching modules (per `feedback_ci_env_dummy_values`). Create it if missing: `VITE_SUPABASE_URL=https://dummy.supabase.co`, `VITE_SUPABASE_PUBLISHABLE_KEY=dummy-anon-key-for-tests`, `VITE_API_BASE_URL=http://localhost:3000`. It is gitignored — never commit it.
- **Conversion is ALWAYS in place** for an anonymous user: `linkIdentity` (Google) / `updateUser` (email). NEVER `signUp` — it creates a new user and orphans the guest's poster (`project_guest_to_permanent_conversion`).
- **User-facing errors stay generic** ("Something went wrong") + a Send-Feedback affordance (`feedback_user_facing_errors`). Never render raw error text.
- **No "AI" language** anywhere in copy (`feedback_marketing_no_ai_framing`).
- **Immutability:** never mutate; spread into new objects.
- **Motion:** existing `--ease-*` / `--dur-*` tokens; respect `prefers-reduced-motion`.
- **The invariant:** the LOGGED-IN editor entry + autosave flow must be unchanged. `EnsureSession` is a no-op render for an existing session; `Editor.tsx` behaviour is identical. This is a regression guard, not a nicety.
- **Commits:** conventional (`feat:`/`test:`/`refactor:`/`docs:`), one per task. Attribution disabled globally.

## Probe tsconfig (for type-checks in this worktree)

```jsonc
// apps/web/tsconfig.probe.json (create, use, delete — never commit)
{ "extends": "./tsconfig.json", "compilerOptions": { "paths": {
  "@/*": ["src/*"],
  "@postr/shared": ["../../packages/shared/src/index.ts"],
  "@postr/shared/*": ["../../packages/shared/src/*"]
} } }
```
Run: `cd apps/web && npx tsc --noEmit -p tsconfig.probe.json 2>&1 | grep -i <yourfile>` — expect no output.

## File Structure

- `apps/web/src/lib/convertGuest.ts` — NEW: focused in-place conversion helper (Task 1).
- `apps/web/src/lib/__tests__/convertGuest.test.ts` — NEW (Task 1).
- `apps/web/src/components/EnsureSession.tsx` — NEW: anonymous-session route wrapper (Task 2).
- `apps/web/src/components/__tests__/EnsureSession.test.tsx` — NEW (Task 2).
- `apps/web/src/routes.tsx` — MODIFY: swap `AuthGuard` → `EnsureSession` on `/p/:posterId` (Task 2).
- `apps/web/src/components/PublicHeader.tsx` — MODIFY: `workspaceLink` logged-out target `/auth?guest=1` → `/p/new` (Task 3).
- `apps/web/src/components/__tests__/toolDiscoverability.test.tsx` — MODIFY: update the expected href (Task 3).
- `apps/web/src/poster/SecureWorkModal.tsx` — NEW: the convert prompt (Task 4).
- `apps/web/src/poster/__tests__/SecureWorkModal.test.tsx` — NEW (Task 4).
- `apps/web/src/hooks/useLeaveGuard.ts` — NEW: beforeunload + in-app-nav guard (Task 5).
- `apps/web/src/hooks/__tests__/useLeaveGuard.test.ts` — NEW (Task 5).
- `apps/web/src/poster/sidebar/EditableExportButtons.tsx` — MODIFY: anonymous gate before paywall (Task 6).
- `apps/web/src/poster/PosterEditor.tsx` (or `pages/Editor.tsx`) — MODIFY: mount the leave guard + modal (Task 6).
- `docs/feature-graph.md`, `docs/manual-test-flows.md` — docs sync (Task 7).

---

### Task 1: `convertGuest` helper (in-place conversion)

**Files:**
- Create: `apps/web/src/lib/convertGuest.ts`
- Test: `apps/web/src/lib/__tests__/convertGuest.test.ts`

**Interfaces:**
- Produces: `convertGuestWithGoogle(redirectTo: string): Promise<{ error: Error | null }>` and `convertGuestWithEmail(email: string, password: string, emailRedirectTo: string): Promise<{ pendingConfirmation: boolean; error: Error | null }>`.
- Rationale: Auth.tsx's conversion is entangled with checkout-intent/consent orchestration. Do NOT extract that whole tangle. Extract only the Supabase-call decision — "an anonymous user converts in place; never signUp" — so `SecureWorkModal` and (optionally, later) Auth.tsx share the same API choice. Auth.tsx is left AS-IS in this task (a later cleanup can adopt the helper; not required here).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/__tests__/convertGuest.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  linkIdentity: vi.fn(),
  updateUser: vi.fn(),
  signUp: vi.fn(),
  signInWithOAuth: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { auth } }));

import { convertGuestWithGoogle, convertGuestWithEmail } from '../convertGuest';

describe('convertGuest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.getSession.mockResolvedValue({
      data: { session: { user: { is_anonymous: true } } },
    });
  });

  it('links Google identity in place for an anonymous user (never OAuth sign-in)', async () => {
    auth.linkIdentity.mockResolvedValue({ error: null });
    const res = await convertGuestWithGoogle('https://app/dashboard');
    expect(auth.linkIdentity).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'https://app/dashboard' },
    });
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
    expect(res.error).toBeNull();
  });

  it('updates the user (never signUp) for email, reporting pending confirmation', async () => {
    auth.updateUser.mockResolvedValue({ data: { user: { is_anonymous: true } }, error: null });
    const res = await convertGuestWithEmail('a@b.com', 'pw123456', 'https://app/dashboard');
    expect(auth.updateUser).toHaveBeenCalledWith(
      { email: 'a@b.com', password: 'pw123456' },
      { emailRedirectTo: 'https://app/dashboard' },
    );
    expect(auth.signUp).not.toHaveBeenCalled();
    // Still anonymous after updateUser → email confirmation pending.
    expect(res.pendingConfirmation).toBe(true);
    expect(res.error).toBeNull();
  });

  it('reports NOT pending when the user is already permanent after update', async () => {
    auth.updateUser.mockResolvedValue({ data: { user: { is_anonymous: false } }, error: null });
    const res = await convertGuestWithEmail('a@b.com', 'pw123456', 'https://app/dashboard');
    expect(res.pendingConfirmation).toBe(false);
  });

  it('surfaces a Supabase error as { error }', async () => {
    auth.linkIdentity.mockResolvedValue({ error: new Error('boom') });
    const res = await convertGuestWithGoogle('https://app/dashboard');
    expect(res.error).toBeInstanceOf(Error);
  });

  it('refuses to convert when the session is not anonymous (guards against orphaning)', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { is_anonymous: false } } } });
    const res = await convertGuestWithEmail('a@b.com', 'pw123456', 'https://app/dashboard');
    expect(res.error).toBeInstanceOf(Error);
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(auth.signUp).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && npx vitest run src/lib/__tests__/convertGuest.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `convertGuest.ts`**

```typescript
/**
 * convertGuest — turn the current ANONYMOUS session into a permanent
 * account IN PLACE, so the guest's posters carry over.
 *
 * Google → linkIdentity (instant on return, no email gap).
 * Email  → updateUser (email_change; the user stays anonymous until
 *          they click the confirmation link → pendingConfirmation).
 *
 * NEVER signUp / signInWithOAuth for a guest: those start a new user
 * and orphan the guest's work. Both helpers re-read the session and
 * refuse if it is not anonymous — the authoritative guard, unbeatable
 * by state-ordering races (mirrors Auth.tsx).
 */
import { supabase } from '@/lib/supabase';

async function assertAnonymous(): Promise<Error | null> {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user.is_anonymous === true) return null;
  return new Error('convertGuest called without an anonymous session');
}

export async function convertGuestWithGoogle(
  redirectTo: string,
): Promise<{ error: Error | null }> {
  const guard = await assertAnonymous();
  if (guard) return { error: guard };
  const { error } = await supabase.auth.linkIdentity({
    provider: 'google',
    options: { redirectTo },
  });
  return { error: error ?? null };
}

export async function convertGuestWithEmail(
  email: string,
  password: string,
  emailRedirectTo: string,
): Promise<{ pendingConfirmation: boolean; error: Error | null }> {
  const guard = await assertAnonymous();
  if (guard) return { pendingConfirmation: false, error: guard };
  const { data, error } = await supabase.auth.updateUser(
    { email: email.trim(), password },
    { emailRedirectTo },
  );
  if (error) return { pendingConfirmation: false, error };
  // updateUser returns { user }; still-anonymous means confirmation pending.
  const stillAnon = data?.user?.is_anonymous !== false;
  return { pendingConfirmation: stillAnon, error: null };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/web && npx vitest run src/lib/__tests__/convertGuest.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/convertGuest.ts apps/web/src/lib/__tests__/convertGuest.test.ts
git commit -m "feat(auth): convertGuest helper for in-place guest→permanent conversion"
```

---

### Task 2: `EnsureSession` wrapper + route swap

**Files:**
- Create: `apps/web/src/components/EnsureSession.tsx`
- Test: `apps/web/src/components/__tests__/EnsureSession.test.tsx`
- Modify: `apps/web/src/routes.tsx:165-173` (`/p/:posterId` element)

**Interfaces:**
- Consumes: `ensureSession(supabase)` from `@/lib/auth` (returns `Promise<Session | null>`, dedupes, handles stale JWT + creates anonymous when none).
- Produces: `EnsureSession({ children }: { children: ReactNode })`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/__tests__/EnsureSession.test.tsx`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const auth = vi.hoisted(() => ({
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
}));
const ensureSessionMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { auth } }));
vi.mock('@/lib/auth', () => ({ ensureSession: ensureSessionMock }));

import { EnsureSession } from '../EnsureSession';

describe('EnsureSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  });

  it('renders children once a session is ensured', async () => {
    ensureSessionMock.mockResolvedValue({ user: { id: 'anon1', is_anonymous: true } });
    render(<EnsureSession><div>editor</div></EnsureSession>);
    expect(await screen.findByText('editor')).toBeInTheDocument();
    expect(ensureSessionMock).toHaveBeenCalledTimes(1);
  });

  it('shows a loading state before the session resolves', () => {
    ensureSessionMock.mockReturnValue(new Promise(() => {})); // never resolves
    render(<EnsureSession><div>editor</div></EnsureSession>);
    expect(screen.queryByText('editor')).toBeNull();
    expect(screen.getByText(/loading|preparing/i)).toBeInTheDocument();
  });

  it('shows a generic error (not raw text) if ensureSession throws', async () => {
    ensureSessionMock.mockRejectedValue(new Error('supabase exploded internals'));
    render(<EnsureSession><div>editor</div></EnsureSession>);
    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeInTheDocument());
    expect(screen.queryByText('editor')).toBeNull();
    expect(screen.queryByText(/exploded internals/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && npx vitest run src/components/__tests__/EnsureSession.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `EnsureSession.tsx`**

```tsx
/**
 * EnsureSession — the editor's session gate.
 *
 * Unlike AuthGuard (which BOUNCES a session-less visitor to /auth),
 * this CREATES an anonymous session and lets them edit immediately —
 * the no-auth editor entry. For a logged-in user it is a no-op:
 * ensureSession() returns the existing session. On SIGNED_OUT it
 * re-ensures a fresh anonymous session rather than dead-ending, so the
 * editor is never left without a session. Genuinely account-required
 * routes (/dashboard, /profile, /admin) keep AuthGuard.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { ensureSession } from '@/lib/auth';

type State = 'preparing' | 'ready' | 'error';

export function EnsureSession({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>('preparing');

  useEffect(() => {
    let cancelled = false;
    ensureSession(supabase)
      .then(() => {
        if (!cancelled) setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      // A wipe (sign-out / account deletion) must not dead-end the
      // editor — re-ensure an anonymous session instead of bouncing.
      if (event === 'SIGNED_OUT') {
        ensureSession(supabase).catch(() => {
          if (!cancelled) setState('error');
        });
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  if (state === 'preparing') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0a0a12] text-[#c8cad0]">
        <div className="animate-pulse text-sm tracking-wide">Preparing your editor…</div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0a0a12] text-[#c8cad0]">
        <div className="max-w-md space-y-3 text-center">
          <p className="text-base font-medium">Something went wrong</p>
          <p className="text-xs text-[#888]">
            We couldn’t start the editor. Refresh to try again.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/web && npx vitest run src/components/__tests__/EnsureSession.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Swap the route**

In `apps/web/src/routes.tsx`, change the `/p/:posterId` element from `AuthGuard` to `EnsureSession` (keep `EditorErrorBoundary` and `Editor`). Add the import `import { EnsureSession } from '@/components/EnsureSession';` and remove `AuthGuard` from this element only (it stays imported for the other routes):

```tsx
        <Route
          path="/p/:posterId"
          element={
            <EnsureSession>
              <EditorErrorBoundary>
                <Editor />
              </EditorErrorBoundary>
            </EnsureSession>
          }
        />
```

- [ ] **Step 6: Type-check + route test still green**

Run the probe tsconfig type-check (Global Constraints) filtered to `EnsureSession` and `routes` — expect no output.
Run: `cd apps/web && npx vitest run src/__tests__/routes.test.tsx` (if present) — expect PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/EnsureSession.tsx apps/web/src/components/__tests__/EnsureSession.test.tsx apps/web/src/routes.tsx
git commit -m "feat(editor): EnsureSession wrapper — anonymous-first editor entry, replaces AuthGuard on /p/:posterId"
```

---

### Task 3: Point the nav "Editor" link at the editor

**Files:**
- Modify: `apps/web/src/components/PublicHeader.tsx` (`workspaceLink`)
- Modify: `apps/web/src/components/__tests__/toolDiscoverability.test.tsx` (expected href)

**Interfaces:** none new.

- [ ] **Step 1: Update the failing test first**

In `toolDiscoverability.test.tsx`, the "PublicHeader workspace link" describe currently asserts the logged-out link href is `/auth?guest=1`. Change both the desktop and mobile assertions to `/p/new`:

```typescript
  it('sends a logged-out visitor straight into the editor', async () => {
    const { container } = renderIn(<PublicHeader />);
    const link = await screen.findByRole('link', { name: /^editor$/i });
    expect(link.getAttribute('href')).toBe('/p/new');
    expect(hrefsOf(container)).not.toContain('/dashboard');
  });

  it('reaches the editor from the mobile menu (signed out)', async () => {
    renderIn(<PublicHeader />);
    await screen.findByRole('link', { name: /^editor$/i });
    fireEvent.click(screen.getByRole('button', { name: /menu/i }));
    const panel = await screen.findByRole('list');
    expect(hrefsOf(panel)).toContain('/p/new');
  });
```

(Delete/replace the old `/auth?guest=1` assertions in that describe.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && npx vitest run src/components/__tests__/toolDiscoverability.test.tsx`
Expected: FAIL — link still points at `/auth?guest=1`.

- [ ] **Step 3: Update `workspaceLink`**

In `PublicHeader.tsx`, change the signed-out branch:

```typescript
  const workspaceLink = signedIn
    ? { to: '/dashboard', label: 'My posters' }
    : { to: '/p/new', label: 'Editor' };
```

Update the adjacent comment to say the logged-out link goes straight to the editor (EnsureSession creates the anonymous session behind it), no `/auth` detour.

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/web && npx vitest run src/components/__tests__/toolDiscoverability.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/PublicHeader.tsx apps/web/src/components/__tests__/toolDiscoverability.test.tsx
git commit -m "feat(nav): logged-out Editor link goes straight to the editor (/p/new)"
```

---

### Task 4: `SecureWorkModal`

**Files:**
- Create: `apps/web/src/poster/SecureWorkModal.tsx`
- Test: `apps/web/src/poster/__tests__/SecureWorkModal.test.tsx`

**Interfaces:**
- Consumes: `convertGuestWithGoogle`, `convertGuestWithEmail` (Task 1).
- Produces: `SecureWorkModal({ reason, onClose, onConverted }: { reason: 'export' | 'leave'; onClose: () => void; onConverted?: () => void })`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/poster/__tests__/SecureWorkModal.test.tsx`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const convert = vi.hoisted(() => ({
  google: vi.fn(),
  email: vi.fn(),
}));
vi.mock('@/lib/convertGuest', () => ({
  convertGuestWithGoogle: convert.google,
  convertGuestWithEmail: convert.email,
}));

import { SecureWorkModal } from '../SecureWorkModal';

describe('SecureWorkModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows an export-flavoured headline for reason="export"', () => {
    render(<SecureWorkModal reason="export" onClose={() => {}} />);
    expect(screen.getByText(/export/i)).toBeInTheDocument();
  });

  it('shows a leave-flavoured headline for reason="leave"', () => {
    render(<SecureWorkModal reason="leave" onClose={() => {}} />);
    expect(screen.getByText(/keep|save|come back/i)).toBeInTheDocument();
  });

  it('converts with Google when the Google button is clicked', () => {
    convert.google.mockResolvedValue({ error: null });
    render(<SecureWorkModal reason="export" onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /google/i }));
    expect(convert.google).toHaveBeenCalledTimes(1);
  });

  it('shows a check-your-email state when email conversion is pending confirmation', async () => {
    convert.email.mockResolvedValue({ pendingConfirmation: true, error: null });
    render(<SecureWorkModal reason="leave" onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pw123456' } });
    fireEvent.click(screen.getByRole('button', { name: /create account|continue with email|sign up/i }));
    await waitFor(() => expect(screen.getByText(/check your email/i)).toBeInTheDocument());
  });

  it('shows a generic error (not raw text) when conversion fails', async () => {
    convert.google.mockResolvedValue({ error: new Error('supabase raw internals') });
    render(<SecureWorkModal reason="export" onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /google/i }));
    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeInTheDocument());
    expect(screen.queryByText(/raw internals/)).toBeNull();
  });

  it('dismisses via the close / not-now control', () => {
    const onClose = vi.fn();
    render(<SecureWorkModal reason="leave" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /not now|leave anyway|close|×/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && npx vitest run src/poster/__tests__/SecureWorkModal.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `SecureWorkModal.tsx`**

Build a modal (reuse the app's existing modal styling conventions — dark panel `#111118`, border `#2a2a3a`, accent `#7c6aed`). Copy per reason:
- `export`: headline "Create an account to export", sub "Your poster is saved to a guest session — create a free account to export it and keep it for good."
- `leave`: headline "Keep this poster", sub "Create a free account so this poster is here when you come back. Guest posters are removed after a while."

Controls (identical both reasons): a **Continue with Google** button (calls `convertGuestWithGoogle(`${window.location.origin}/dashboard`)`), an email + password form (calls `convertGuestWithEmail(email, password, `${window.location.origin}/dashboard`)`), and a dismiss control ("Not now" for leave / "Cancel" for export). On Google error or email error → set a generic error string ("Something went wrong. Try again, or send feedback.") — never the raw message. On email `pendingConfirmation: true` → swap the body to a "Check your email to finish creating your account" state (do NOT claim saved/permanent yet). On success (Google returns; email non-pending) → call `onConverted?.()` then `onClose()`.

```tsx
/**
 * SecureWorkModal — prompts an anonymous editor to secure their poster
 * to a permanent account. Same modal for two triggers; `reason` only
 * changes the copy. Conversion is in place (convertGuest*), never a
 * fresh signUp, so the poster carries over.
 */
import { useState } from 'react';
import { convertGuestWithGoogle, convertGuestWithEmail } from '@/lib/convertGuest';

interface Props {
  reason: 'export' | 'leave';
  onClose: () => void;
  onConverted?: () => void;
}

const COPY = {
  export: {
    title: 'Create an account to export',
    body: 'Your poster is saved to a guest session — create a free account to export it and keep it for good.',
    dismiss: 'Cancel',
  },
  leave: {
    title: 'Keep this poster',
    body: 'Create a free account so this poster is here when you come back. Guest posters are removed after a while.',
    dismiss: 'Not now',
  },
} as const;

const GENERIC_ERROR = 'Something went wrong. Try again, or send feedback.';

export function SecureWorkModal({ reason, onClose, onConverted }: Props) {
  const copy = COPY[reason];
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);
  const redirectTo = `${window.location.origin}/dashboard`;

  async function google() {
    setError(null);
    const { error: err } = await convertGuestWithGoogle(redirectTo);
    if (err) { setError(GENERIC_ERROR); return; }
    // linkIdentity redirects the browser; onConverted runs on return.
    onConverted?.();
  }

  async function email_() {
    setError(null);
    setPending(true);
    const { pendingConfirmation, error: err } = await convertGuestWithEmail(email, password, redirectTo);
    setPending(false);
    if (err) { setError(GENERIC_ERROR); return; }
    if (pendingConfirmation) { setConfirmSent(true); return; }
    onConverted?.();
    onClose();
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={copy.title} /* overlay + panel styling */>
      {/* title = copy.title; body = copy.body */}
      {confirmSent ? (
        <p>Check your email to finish creating your account. Your poster is safe in the meantime.</p>
      ) : (
        <>
          <button type="button" onClick={google}>Continue with Google</button>
          <form onSubmit={(e) => { e.preventDefault(); void email_(); }}>
            <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            <button type="submit" disabled={pending}>Create account</button>
          </form>
          {error && <p role="alert">{error}</p>}
        </>
      )}
      <button type="button" onClick={onClose}>{copy.dismiss}</button>
    </div>
  );
}
```

(Flesh out the overlay/panel markup + inline styles to match the app's modal look; keep the roles/labels the tests query: `dialog`, buttons named Google / Create account / dismiss, email + password labelled inputs, `role="alert"` for errors.)

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/web && npx vitest run src/poster/__tests__/SecureWorkModal.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/poster/SecureWorkModal.tsx apps/web/src/poster/__tests__/SecureWorkModal.test.tsx
git commit -m "feat(editor): SecureWorkModal — convert-in-place prompt for export/leave"
```

---

### Task 5: `useLeaveGuard`

**Files:**
- Create: `apps/web/src/hooks/useLeaveGuard.ts`
- Test: `apps/web/src/hooks/__tests__/useLeaveGuard.test.ts`

**Interfaces:**
- Consumes: `usePosterStore(s => s.canUndo)` (the "has edited this session" flag), `usePlan().isGuest` (true when no session OR anonymous).
- Produces: `useLeaveGuard(): { armed: boolean; leaveModalOpen: boolean; requestLeave: () => boolean; confirmLeave: () => void; cancelLeave: () => void }`.
  - `armed` = `isGuest && canUndo`.
  - Adds/removes a `beforeunload` listener when `armed` toggles (armed → the browser shows its native dialog on tab-close/refresh).
  - `requestLeave()` returns `true` if navigation should be blocked (armed) — the caller opens the modal — or `false` to proceed. `confirmLeave()` = allow the pending navigation; `cancelLeave()` = dismiss.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/hooks/__tests__/useLeaveGuard.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const store = vi.hoisted(() => ({ canUndo: false }));
const plan = vi.hoisted(() => ({ isGuest: true }));
vi.mock('@/stores/posterStore', () => ({
  usePosterStore: (sel: (s: { canUndo: boolean }) => unknown) => sel(store),
}));
vi.mock('@/hooks/usePlan', () => ({ usePlan: () => plan }));

import { useLeaveGuard } from '../useLeaveGuard';

describe('useLeaveGuard', () => {
  beforeEach(() => {
    store.canUndo = false;
    plan.isGuest = true;
    vi.restoreAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());

  it('arms only when the user is a guest AND has edited (canUndo)', () => {
    store.canUndo = true;
    plan.isGuest = true;
    const add = vi.spyOn(window, 'addEventListener');
    const { result } = renderHook(() => useLeaveGuard());
    expect(result.current.armed).toBe(true);
    expect(add).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });

  it('does not arm for a permanent (non-guest) user even after edits', () => {
    store.canUndo = true;
    plan.isGuest = false;
    const { result } = renderHook(() => useLeaveGuard());
    expect(result.current.armed).toBe(false);
  });

  it('does not arm for a guest who has not edited', () => {
    store.canUndo = false;
    plan.isGuest = true;
    const { result } = renderHook(() => useLeaveGuard());
    expect(result.current.armed).toBe(false);
  });

  it('requestLeave blocks (returns true) and opens the modal when armed', () => {
    store.canUndo = true;
    const { result } = renderHook(() => useLeaveGuard());
    let blocked = false;
    act(() => { blocked = result.current.requestLeave(); });
    expect(blocked).toBe(true);
    expect(result.current.leaveModalOpen).toBe(true);
  });

  it('requestLeave allows (returns false) when not armed', () => {
    store.canUndo = false;
    const { result } = renderHook(() => useLeaveGuard());
    let blocked = true;
    act(() => { blocked = result.current.requestLeave(); });
    expect(blocked).toBe(false);
  });

  it('removes the beforeunload listener when it disarms', () => {
    store.canUndo = true;
    const remove = vi.spyOn(window, 'removeEventListener');
    const { rerender } = renderHook(() => useLeaveGuard());
    store.canUndo = false;
    rerender();
    expect(remove).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && npx vitest run src/hooks/__tests__/useLeaveGuard.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `useLeaveGuard.ts`**

```typescript
/**
 * useLeaveGuard — nudges an anonymous editor to secure their work
 * before they leave. Active only when the session is a guest AND the
 * poster has been edited this session (canUndo). Arms a beforeunload
 * handler (the browser's native "Leave site?" dialog is all the
 * platform allows on real tab-close/refresh) and exposes a
 * requestLeave() gate for in-app navigation, where we can show our own
 * SecureWorkModal instead.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePosterStore } from '@/stores/posterStore';
import { usePlan } from '@/hooks/usePlan';

export function useLeaveGuard() {
  const canUndo = usePosterStore((s) => s.canUndo);
  const { isGuest } = usePlan();
  const armed = isGuest && canUndo;
  const armedRef = useRef(armed);
  armedRef.current = armed;
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const allowNextRef = useRef(false);

  useEffect(() => {
    if (!armed) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ''; // required for the native prompt in some browsers
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [armed]);

  const requestLeave = useCallback((): boolean => {
    if (allowNextRef.current || !armedRef.current) return false; // proceed
    setLeaveModalOpen(true);
    return true; // block
  }, []);

  const confirmLeave = useCallback(() => {
    allowNextRef.current = true;
    setLeaveModalOpen(false);
  }, []);

  const cancelLeave = useCallback(() => setLeaveModalOpen(false), []);

  return { armed, leaveModalOpen, requestLeave, confirmLeave, cancelLeave };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/web && npx vitest run src/hooks/__tests__/useLeaveGuard.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/useLeaveGuard.ts apps/web/src/hooks/__tests__/useLeaveGuard.test.ts
git commit -m "feat(editor): useLeaveGuard — beforeunload + in-app-nav guard for anonymous edits"
```

---

### Task 6: Wire the gates — export prompt + leave prompt

**Files:**
- Modify: `apps/web/src/poster/sidebar/EditableExportButtons.tsx` (anonymous gate)
- Modify: `apps/web/src/pages/Editor.tsx` (mount the leave guard + modal around `PosterEditor`)
- Test: extend `EditableExportButtons` test (create if absent) + a small Editor-guard test.

**Interfaces:**
- Consumes: `SecureWorkModal` (Task 4), `useLeaveGuard` (Task 5), `usePlan().isGuest`.

- [ ] **Step 1: Export gate — write the failing test**

If `apps/web/src/poster/sidebar/__tests__/EditableExportButtons.test.tsx` doesn't exist, create it with a mock for `usePlan` and the export data layer. Assert: when `usePlan().isGuest === true`, clicking an export button opens `SecureWorkModal` (reason "export") and does NOT invoke the export job; when a permanent user with `canExport`, the export job runs. (Mock the heavy export functions.) Key assertion:

```typescript
// isGuest → modal, not export
expect(screen.getByRole('dialog', { name: /create an account to export/i })).toBeInTheDocument();
expect(exportJobMock).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && npx vitest run src/poster/sidebar/__tests__/EditableExportButtons.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Add the anonymous gate in `run()`**

In `EditableExportButtons.tsx`, add a modal state (`const [securePrompt, setSecurePrompt] = useState(false)`), read `const { isGuest } = plan` (usePlan already provides it), and at the top of `run()` — before the `if (!canExport) return;` line:

```typescript
    if (plan.isGuest) {
      setSecurePrompt(true);
      return;
    }
```

Render `{securePrompt && <SecureWorkModal reason="export" onClose={() => setSecurePrompt(false)} />}` in the component's JSX.

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/web && npx vitest run src/poster/sidebar/__tests__/EditableExportButtons.test.tsx`
Expected: PASS.

- [ ] **Step 5: Leave gate — mount in Editor.tsx**

In `Editor.tsx`'s `EditorWithGuards` (which already wraps `PosterEditor`), call `useLeaveGuard()` and render `{leaveModalOpen && <SecureWorkModal reason="leave" onClose={cancelLeave} onConverted={confirmLeave} />}`. Wire in-app navigation: intercept nav-away from the editor. The lightest correct hook is the header/nav links + a react-router blocker. Concretely: pass `requestLeave` down so the primary in-editor "leave" affordances (the header logo / "My posters" link within the editor chrome, and any back-to-dashboard control) call `if (requestLeave()) return;` before navigating. (A full `unstable_useBlocker` integration is optional polish; the beforeunload handler already covers tab-close/refresh, and the in-editor nav controls are the realistic in-app exits.)

Add a focused test asserting `EditorWithGuards` renders the leave modal when `useLeaveGuard` reports `leaveModalOpen` (mock the hook).

- [ ] **Step 6: Run the poster + pages + components suites**

Run: `cd apps/web && npx vitest run src/poster src/pages src/components src/hooks src/lib`
Expected: PASS (no regressions).

- [ ] **Step 7: Manual smoke (if previewable)**

The worktree has no `node_modules`, so the dev server likely can't start here. If it can: log out, click Editor → land on the canvas with no signup; edit a block; click Export → SecureWorkModal; try to close the tab → native prompt. Screenshot for the user. If not previewable, say so and rely on the unit tests.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/poster/sidebar/EditableExportButtons.tsx apps/web/src/pages/Editor.tsx apps/web/src/poster/sidebar/__tests__/EditableExportButtons.test.tsx
git commit -m "feat(editor): gate export + leave behind the secure-work prompt for anonymous users"
```

---

### Task 7: Code review, docs sync, memory

**Files:**
- Modify: `docs/feature-graph.md`, `docs/manual-test-flows.md`
- Modify: memory (`project_no_auth_editor` new; cross-ref `project_doc_conflicts_to_check`).

- [ ] **Step 1: Full app test suite**

Run: `cd apps/web && npx vitest run`
Expected: PASS (the pre-existing `manuscript/slides` + `export/pdf` files fail only on missing `pdf-lib`/`@gsap` deps in this worktree — unrelated; confirm no NEW failures in charts/poster/components/hooks/lib).

- [ ] **Step 2: Code review**

Dispatch the code-reviewer agent over `git diff origin/main...HEAD`. Focus: the "same editor" invariant (logged-in flow unchanged), the never-signUp guarantee in convertGuest, the SIGNED_OUT re-ensure (no dead-end), beforeunload cleanup, and that the prompts never fire for permanent users. Address CRITICAL/HIGH inline; re-run tests after fixes.

- [ ] **Step 3: Update `feature-graph.md`**

Document: `/p/:posterId` now uses `EnsureSession` (not `AuthGuard`) — anonymous-first editor entry; the `SecureWorkModal` + `useLeaveGuard` + export gate; `convertGuest`. Correct the stale "AuthGuard ensureSession" claim flagged in `project_doc_conflicts_to_check`.

- [ ] **Step 4: Update `manual-test-flows.md`**

Add a flow: edit as anonymous (no signup) → export prompt → convert with Google → poster carries over; plus the leave prompt (in-app modal + native tab-close).

- [ ] **Step 5: Memory**

Write `project_no_auth_editor` (shipped: silent-anon entry, EnsureSession, two prompts, convertGuest; same-editor invariant). Add the index line to MEMORY.md.

- [ ] **Step 6: Commit**

```bash
git add docs/feature-graph.md docs/manual-test-flows.md
git commit -m "docs(editor): document the no-auth editor entry and secure-work prompts"
```

---

## Self-Review

**Spec coverage:**
- Silent anonymous entry (EnsureSession, `/p/new`, no AuthGuard) → Tasks 2, 3. ✓
- Same-editor invariant (PosterEditor untouched; logged-in flow identical) → Task 2 (no-op for existing session) + Task 7 review. ✓
- Prompt on export → Task 6. Prompt on leave (native beforeunload + in-app modal) → Tasks 5, 6. ✓
- Convert in place, never signUp → Task 1 (+ guard test). ✓
- Anonymous+dirty gating (canUndo, isGuest) → Task 5. ✓
- Docs/memory sync → Task 7. ✓

**Placeholder scan:** Every code step has literal code; SecureWorkModal's markup is described with the exact roles/labels the tests assert, and the styling is "match the app's modal" (a real instruction, not a TODO). No TBD/TODO. ✓

**Type consistency:** `convertGuestWithGoogle(redirectTo)` / `convertGuestWithEmail(email, password, emailRedirectTo)` — same signatures in Task 1 (def), Task 4 (consume). `useLeaveGuard()` return shape (`armed`, `leaveModalOpen`, `requestLeave`, `confirmLeave`, `cancelLeave`) — same in Task 5 (def) and Task 6 (consume). `SecureWorkModal` props (`reason`, `onClose`, `onConverted`) — same in Task 4 (def), Task 6 (mounts). `usePlan().isGuest` — used in Tasks 5, 6, verified to exist. ✓
