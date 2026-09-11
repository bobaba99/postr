-- ==========================================================================
-- Account deletion hardening (lifecycle audit P0-3)
-- ==========================================================================
--
-- Account deletion moves from the browser-callable RPC to the API route
-- POST /account/delete (apps/api/src/account.ts), which cancels the
-- user's Stripe subscriptions, deletes the Stripe customer, removes the
-- user's Storage objects and only then deletes the auth user. The RPC
-- alone (`delete from auth.users`) cascaded public.users — and with it
-- stripe_customer_id / stripe_subscription_id — while Stripe kept
-- invoicing the live term.
--
-- Two changes:
--
--   (a) public.account_deletions — the audit trail the API writes right
--       before the auth delete: which Stripe customer, which subscription
--       ids were cancelled, how many Storage objects went. The users row
--       is gone by then, so this is the only record left for reconciling
--       a Stripe-side event that still names the deleted account.
--       service_role only: RLS enabled with NO policies, and every
--       table privilege revoked from public, anon and authenticated (the
--       schema-public default privileges grant all three — the revoke
--       must name them explicitly, as 20260610120000 does for functions).
--
--   (b) delete_own_account() — DROPPED. Every caller now goes through the
--       API route, so the RPC has no legitimate client left. It is dropped
--       rather than kept with EXECUTE revoked because on supabase/postgres
--       17.6.1.106 (the build CI pinned until 2026-09-11) a browser role
--       (anon or authenticated) calling ANY function it lacks EXECUTE on
--       segfaults the backend — the whole database restarts in recovery.
--       Reproduced with a one-line function; fixed in 17.6.1.143. A stale
--       client bundle calling the dropped RPC gets a plain
--       "function does not exist" error (42883), which is harmless on
--       every build. Client call site already migrated:
--       apps/web/src/profile/accountDeletion.ts → deleteAccount() from
--       apps/web/src/data/account.ts.

-- --------------------------------------------------------------------------
-- (a) audit table
-- --------------------------------------------------------------------------
create table if not exists public.account_deletions (
  id uuid primary key default gen_random_uuid(),
  -- No FK: the auth.users row is deleted moments after this row is written.
  user_id uuid not null,
  deleted_at timestamptz not null default now(),
  stripe_customer_id text,
  cancelled_subscription_ids text[] not null default '{}',
  storage_objects_removed integer not null default 0
    check (storage_objects_removed >= 0)
);

comment on table public.account_deletions is
  'Audit trail written by POST /account/delete (service_role) right before auth.admin.deleteUser: the Stripe customer + subscription ids wound down and the Storage object count removed. Server-only; no browser role can read or write it.';

create index if not exists account_deletions_user_id_idx
  on public.account_deletions (user_id);

alter table public.account_deletions enable row level security;
-- No policies on purpose: with RLS on and zero policies, anon and
-- authenticated see nothing even if a privilege slipped back in.

revoke all on table public.account_deletions from public, anon, authenticated;
grant all on table public.account_deletions to service_role;

-- --------------------------------------------------------------------------
-- (b) the RPC is gone — nothing is left for a browser session to call
-- --------------------------------------------------------------------------
drop function if exists public.delete_own_account();
