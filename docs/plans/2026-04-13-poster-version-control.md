# Poster Version Control

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users save named versions of their poster and restore any previous version — like "Save As" checkpoints that protect against destructive edits.

**Architecture:** Store version snapshots as rows in a `poster_versions` table, each containing the full `PosterDoc` JSONB at the time of the save. Versions are explicitly user-triggered (not every autosave). The UI exposes a version history panel in the sidebar.

**Tech Stack:** Supabase Postgres (new `poster_versions` table with RLS), Zustand store, Sidebar panel

---

## Data Model

### New table: `poster_versions`

```sql
create table public.poster_versions (
  id uuid primary key default gen_random_uuid(),
  poster_id uuid not null references public.posters(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  data jsonb not null,
  created_at timestamptz not null default now()
);

-- Index for fast listing by poster
create index idx_poster_versions_poster on poster_versions(poster_id, created_at desc);

-- RLS: users can only see/create/delete their own versions
alter table poster_versions enable row level security;

create policy "owner_select" on poster_versions for select
  using (auth.uid() = user_id);

create policy "owner_insert" on poster_versions for insert
  with check (auth.uid() = user_id);

create policy "owner_delete" on poster_versions for delete
  using (auth.uid() = user_id);
```

### Limits

- Max 20 versions per poster (enforce client-side; show warning at 15)
- Version names are optional (default: auto-generated timestamp like "Apr 13, 5:30 PM")
- No `data` column size limit — same as the poster's own `data` column

---

## Tasks

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/YYYYMMDD_poster_versions.sql`

Create the table, index, and RLS policies above. Run `supabase db push`.

### Task 2: Data layer — CRUD functions

**Files:**
- Create: `apps/web/src/data/posterVersions.ts`

```typescript
export interface PosterVersion {
  id: string;
  poster_id: string;
  user_id: string;
  name: string;
  data: PosterDoc;
  created_at: string;
}

// List versions for a poster (newest first, max 20)
export async function listVersions(posterId: string): Promise<PosterVersion[]>

// Save a version snapshot
export async function saveVersion(posterId: string, name: string, data: PosterDoc): Promise<PosterVersion>

// Delete a version
export async function deleteVersion(versionId: string): Promise<void>

// Restore a version (returns the PosterDoc to load into the store)
export async function loadVersion(versionId: string): Promise<PosterDoc | null>
```

### Task 3: Version History sidebar panel

**Files:**
- Create: `apps/web/src/poster/VersionPanel.tsx`
- Modify: `apps/web/src/poster/Sidebar.tsx` — add "Versions" tab

UI design:
- New sidebar tab "Versions" (icon: clock/history)
- "Save Version" button at top with optional name input
- List of saved versions (name + timestamp + restore/delete buttons)
- Restore button loads the version's `data` into the Zustand store
- Confirmation modal before restore ("This will replace your current poster. Your current state will be auto-saved as a version first.")
- Delete button with confirmation
- Badge showing version count (e.g., "Versions (3)")

### Task 4: Auto-save current state before restore

**Files:**
- Modify: `apps/web/src/poster/VersionPanel.tsx`

Before restoring a version, automatically save the current poster state as a version named "Before restore — {timestamp}". This prevents data loss from accidental restores.

### Task 5: Keyboard shortcut

**Files:**
- Modify: `apps/web/src/poster/PosterEditor.tsx`

Add `Cmd+S` / `Ctrl+S` to save a version (shows a quick toast "Version saved"). Prevents the browser's native save dialog.

---

## UX Flow

1. User works on poster (autosave handles persistence)
2. User reaches a milestone → clicks "Save Version" or presses Cmd+S
3. Version appears in the history list with timestamp
4. User makes destructive changes
5. User opens Versions tab → clicks "Restore" on a previous version
6. System auto-saves current state as "Before restore" version
7. Poster reverts to the selected version's state
8. Autosave persists the restored state

## Verification

1. Save a version → verify it appears in the list
2. Make changes → restore the version → verify poster reverts
3. Check that "Before restore" auto-version was created
4. Delete a version → verify it's gone
5. Check RLS: user A can't see user B's versions
6. Verify 20-version limit with warning at 15
