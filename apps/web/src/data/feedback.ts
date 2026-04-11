/**
 * Feedback repository — Supabase writes for the `feedback` table.
 *
 * Users submit bug reports, feature requests, or free-form notes from
 * the Dashboard, Profile, or About pages. Reads are limited to the
 * submitter's own rows via RLS; triage happens in Supabase Studio.
 */
import { supabase } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

// The `feedback` table isn't in the generated Database type yet — it
// lands in packages/shared/src/database.types.ts the next time
// `npm run db:types` runs against a DB that has migration
// 20260410020000_feedback.sql applied. Until then, use an untyped
// client alias for this one module so callers stay type-safe via
// FeedbackInput / FeedbackRow below.
const db = supabase as unknown as SupabaseClient;

export type FeedbackKind = 'bug' | 'feature' | 'other';

export interface FeedbackInput {
  kind: FeedbackKind;
  title: string;
  body: string;
}

export interface FeedbackRow {
  id: string;
  user_id: string | null;
  kind: FeedbackKind;
  title: string;
  body: string;
  page_url: string | null;
  user_agent: string | null;
  status: 'new' | 'triaged' | 'in_progress' | 'done' | 'wontfix';
  created_at: string;
}

const TITLE_MAX = 120;
const BODY_MAX = 4000;

export interface FeedbackValidationError {
  field: 'title' | 'body';
  message: string;
}

export function validateFeedback(input: FeedbackInput): FeedbackValidationError | null {
  const title = input.title.trim();
  const body = input.body.trim();

  if (title.length === 0) {
    return { field: 'title', message: 'Please add a short title.' };
  }
  if (title.length > TITLE_MAX) {
    return { field: 'title', message: `Title is too long (max ${TITLE_MAX} characters).` };
  }
  if (body.length === 0) {
    return { field: 'body', message: 'Please describe what you have in mind.' };
  }
  if (body.length > BODY_MAX) {
    return { field: 'body', message: `Description is too long (max ${BODY_MAX} characters).` };
  }
  return null;
}

export async function submitFeedback(input: FeedbackInput): Promise<void> {
  const validation = validateFeedback(input);
  if (validation) {
    throw new Error(validation.message);
  }

  // Public pages (Gallery, About, Privacy, etc.) are not wrapped by
  // AuthGuard, so an anonymous visitor who lands on /gallery and opens
  // the footer feedback modal has no Supabase session yet. The feedback
  // table requires user_id = auth.uid() via RLS, so we need *some*
  // session before insert. signInAnonymously is cheap, idempotent for
  // the lifetime of the tab, and matches the PRD's anonymous-first
  // philosophy. We only do it if no session exists — never escalate
  // an authenticated user to anonymous.
  let { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    const { error: signInError } = await supabase.auth.signInAnonymously();
    if (signInError) {
      throw new Error(`Could not start a session: ${signInError.message}`);
    }
    const refetched = await supabase.auth.getUser();
    if (refetched.error || !refetched.data.user) {
      throw new Error('Could not establish a session. Please reload and try again.');
    }
    userData = refetched.data;
  }

  const pageUrl = typeof window !== 'undefined' ? window.location.href.slice(0, 500) : null;
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 500) : null;

  const { error } = await db.from('feedback').insert({
    user_id: userData.user.id,
    kind: input.kind,
    title: input.title.trim(),
    body: input.body.trim(),
    page_url: pageUrl,
    user_agent: userAgent,
  });

  if (error) {
    if (error.message.includes('rate_limit_exceeded')) {
      throw new Error('You have reached the daily limit. Please try again tomorrow.');
    }
    throw new Error(`Could not send feedback: ${error.message}`);
  }
}

export async function listMyFeedback(): Promise<FeedbackRow[]> {
  const { data, error } = await db
    .from('feedback')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(`Could not load your feedback: ${error.message}`);
  }
  return (data ?? []) as unknown as FeedbackRow[];
}
