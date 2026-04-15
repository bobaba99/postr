/**
 * Comments repository — Supabase reads/writes for `poster_comments`.
 *
 * Anyone with an anonymous Supabase session can insert a comment on a
 * public poster. The RLS policy enforces both visibility (poster must
 * be public, or the caller must own it) and identity (`user_id` must
 * match the session) — this client layer just marshals rows.
 */
import { supabase } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

// The `poster_comments` table isn't in the generated Database type
// until `npm run db:types` regenerates against an applied migration.
// Use an untyped alias here and keep callers honest via CommentRow.
const db = supabase as unknown as SupabaseClient;

export type CommentAnchorType = 'doc' | 'block' | 'text' | 'area';

/**
 * Anchor data is stored as jsonb so the shape can evolve without a
 * migration. `doc` needs no fields. `block` + `text` reference a
 * Block id. `text` additionally carries the plain-text char offsets
 * inside the block so we can highlight on render. `area` is a bbox
 * in poster units (1 unit = 0.1").
 */
export interface CommentAnchorDoc { type: 'doc' }
export interface CommentAnchorBlock { type: 'block'; blockId: string }
export interface CommentAnchorText {
  type: 'text';
  blockId: string;
  start: number;
  end: number;
  quote?: string;
}
export interface CommentAnchorArea {
  type: 'area';
  // [x, y, w, h] in poster units.
  rect: [number, number, number, number];
}
export type CommentAnchor =
  | CommentAnchorDoc
  | CommentAnchorBlock
  | CommentAnchorText
  | CommentAnchorArea;

export interface CommentRow {
  id: string;
  poster_id: string;
  user_id: string;
  author_name: string;
  parent_id: string | null;
  anchor_type: CommentAnchorType;
  anchor: Record<string, unknown>;
  body: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: string;
  posterId: string;
  userId: string;
  authorName: string;
  parentId: string | null;
  anchor: CommentAnchor;
  body: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToComment(r: CommentRow): Comment {
  const anchor = normalizeAnchor(r.anchor_type, r.anchor);
  return {
    id: r.id,
    posterId: r.poster_id,
    userId: r.user_id,
    authorName: r.author_name,
    parentId: r.parent_id,
    anchor,
    body: r.body,
    resolvedAt: r.resolved_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function normalizeAnchor(
  type: CommentAnchorType,
  raw: Record<string, unknown>,
): CommentAnchor {
  switch (type) {
    case 'doc':
      return { type: 'doc' };
    case 'block':
      return { type: 'block', blockId: String(raw.blockId ?? '') };
    case 'text':
      return {
        type: 'text',
        blockId: String(raw.blockId ?? ''),
        start: Number(raw.start ?? 0),
        end: Number(raw.end ?? 0),
        quote: raw.quote ? String(raw.quote) : undefined,
      };
    case 'area': {
      const r = Array.isArray(raw.rect) ? raw.rect : [0, 0, 0, 0];
      return {
        type: 'area',
        rect: [
          Number(r[0] ?? 0),
          Number(r[1] ?? 0),
          Number(r[2] ?? 0),
          Number(r[3] ?? 0),
        ],
      };
    }
  }
}

export interface CreateCommentInput {
  posterId: string;
  authorName: string;
  body: string;
  anchor: CommentAnchor;
  parentId?: string | null;
}

/** Insert a new comment. Requires an active Supabase session. */
export async function createComment(
  input: CreateCommentInput,
): Promise<Comment> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const name = input.authorName.trim();
  if (!name) throw new Error('Please enter a display name to comment.');
  if (name.length > 60) throw new Error('Display name must be 60 characters or fewer.');
  const body = input.body.trim();
  if (!body) throw new Error('Comment cannot be empty.');
  if (body.length > 4000) throw new Error('Comment is too long (4000 char max).');

  const { anchorType, anchorJson } = serializeAnchor(input.anchor);

  const { data, error } = await db
    .from('poster_comments')
    .insert({
      poster_id: input.posterId,
      user_id: user.id,
      author_name: name,
      parent_id: input.parentId ?? null,
      anchor_type: anchorType,
      anchor: anchorJson,
      body,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return rowToComment(data as CommentRow);
}

function serializeAnchor(a: CommentAnchor): {
  anchorType: CommentAnchorType;
  anchorJson: Record<string, unknown>;
} {
  switch (a.type) {
    case 'doc':
      return { anchorType: 'doc', anchorJson: {} };
    case 'block':
      return { anchorType: 'block', anchorJson: { blockId: a.blockId } };
    case 'text':
      return {
        anchorType: 'text',
        anchorJson: {
          blockId: a.blockId,
          start: a.start,
          end: a.end,
          quote: a.quote,
        },
      };
    case 'area':
      return { anchorType: 'area', anchorJson: { rect: a.rect } };
  }
}

/** Fetch all comments on a poster, newest first. */
export async function listComments(posterId: string): Promise<Comment[]> {
  const { data, error } = await db
    .from('poster_comments')
    .select('*')
    .eq('poster_id', posterId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as CommentRow[]).map(rowToComment);
}

/** Replace a comment's anchor (author only, enforced by RLS). Used
 *  when a reviewer fine-tunes the position/size of their area rect
 *  after posting. Only area anchors are realistically moveable
 *  today — block/text are pinned to a specific node. */
export async function updateCommentAnchor(
  id: string,
  anchor: CommentAnchor,
): Promise<Comment> {
  const { anchorType, anchorJson } = serializeAnchor(anchor);
  const { data, error } = await db
    .from('poster_comments')
    .update({ anchor_type: anchorType, anchor: anchorJson })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return rowToComment(data as CommentRow);
}

/** Update a comment's body (author only, enforced by RLS). */
export async function editCommentBody(
  id: string,
  body: string,
): Promise<Comment> {
  const trimmed = body.trim();
  if (!trimmed) throw new Error('Comment cannot be empty.');
  const { data, error } = await db
    .from('poster_comments')
    .update({ body: trimmed })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return rowToComment(data as CommentRow);
}

/** Mark a thread resolved (or un-resolve by passing null). */
export async function setCommentResolved(
  id: string,
  resolved: boolean,
): Promise<Comment> {
  const { data, error } = await db
    .from('poster_comments')
    .update({ resolved_at: resolved ? new Date().toISOString() : null })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return rowToComment(data as CommentRow);
}

/** Delete a comment (author or poster owner, enforced by RLS). */
export async function deleteComment(id: string): Promise<void> {
  const { error } = await db.from('poster_comments').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
