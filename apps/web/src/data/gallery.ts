/**
 * Gallery repository — reads and writes for the `gallery_entries` table.
 *
 * Public listing endpoints use the anonymous Supabase client: the RLS
 * policy `gallery_entries_public_select` lets anon read any row where
 * retracted_at is null. No auth required for /gallery browsing.
 *
 * Upload helpers live here too — they push files into the public
 * `gallery` bucket under `{user_id}/{entry_id}.{ext}`.
 */
import { supabase } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

// The gallery_entries table isn't in packages/shared/database.types.ts yet.
// Once `npm run db:types` is re-run after this migration is applied, the
// cast below can be removed and supabase.from('gallery_entries') will
// return the typed builder.
const db = supabase as unknown as SupabaseClient;

export type GallerySource = 'postr_poster' | 'upload';

export type GalleryField =
  | 'neuroscience'
  | 'psychology'
  | 'medicine'
  | 'biology'
  | 'computer_science'
  | 'physics'
  | 'chemistry'
  | 'engineering'
  | 'social_sciences'
  | 'humanities'
  | 'other';

export const FIELD_OPTIONS: Array<{ value: GalleryField; label: string }> = [
  { value: 'neuroscience', label: 'Neuroscience' },
  { value: 'psychology', label: 'Psychology' },
  { value: 'medicine', label: 'Medicine' },
  { value: 'biology', label: 'Biology' },
  { value: 'computer_science', label: 'Computer Science' },
  { value: 'physics', label: 'Physics' },
  { value: 'chemistry', label: 'Chemistry' },
  { value: 'engineering', label: 'Engineering' },
  { value: 'social_sciences', label: 'Social Sciences' },
  { value: 'humanities', label: 'Humanities' },
  { value: 'other', label: 'Other' },
];

export function labelForField(field: GalleryField): string {
  return FIELD_OPTIONS.find((f) => f.value === field)?.label ?? field;
}

export interface GalleryEntry {
  id: string;
  user_id: string;
  source: GallerySource;
  poster_id: string | null;
  image_path: string;
  pdf_path: string | null;
  title: string;
  field: GalleryField;
  conference: string | null;
  year: number | null;
  notes: string | null;
  created_at: string;
  retracted_at: string | null;
  // Set when the entry was taken down by a moderator (not the owner).
  // Null either means the entry is still public or the owner retracted
  // it themselves (owner retraction hard-deletes the row entirely, so
  // this column will never be populated for owner actions).
  retracted_by: string | null;
  retraction_reason: string | null;
}

export interface GalleryEntryWithUrls extends GalleryEntry {
  image_url: string;
  pdf_url: string | null;
}

const BUCKET = 'gallery';

function publicUrlFor(path: string): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

function withUrls(row: GalleryEntry): GalleryEntryWithUrls {
  return {
    ...row,
    image_url: publicUrlFor(row.image_path),
    pdf_url: row.pdf_path ? publicUrlFor(row.pdf_path) : null,
  };
}

export interface ListGalleryParams {
  field?: GalleryField;
  limit?: number;
  offset?: number;
}

export async function listGallery(
  params: ListGalleryParams = {},
): Promise<GalleryEntryWithUrls[]> {
  const limit = params.limit ?? 24;
  const offset = params.offset ?? 0;

  let query = db
    .from('gallery_entries')
    .select('*')
    .is('retracted_at', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (params.field) {
    query = query.eq('field', params.field);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Could not load gallery: ${error.message}`);
  }
  return ((data ?? []) as unknown as GalleryEntry[]).map(withUrls);
}

export async function getGalleryEntry(id: string): Promise<GalleryEntryWithUrls | null> {
  const { data, error } = await db
    .from('gallery_entries')
    .select('*')
    .eq('id', id)
    .is('retracted_at', null)
    .maybeSingle();
  if (error) {
    throw new Error(`Could not load gallery entry: ${error.message}`);
  }
  if (!data) return null;
  return withUrls(data as unknown as GalleryEntry);
}

export async function listMyGallery(): Promise<GalleryEntryWithUrls[]> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw new Error('Not signed in.');
  }
  const { data, error } = await db
    .from('gallery_entries')
    .select('*')
    .eq('user_id', userData.user.id)
    .order('created_at', { ascending: false });
  if (error) {
    throw new Error(`Could not load your gallery submissions: ${error.message}`);
  }
  return ((data ?? []) as unknown as GalleryEntry[]).map(withUrls);
}

export interface CreateGalleryEntryInput {
  source: GallerySource;
  poster_id?: string | null;
  image_file: Blob;
  image_ext: 'png' | 'jpg' | 'jpeg' | 'webp';
  pdf_file?: Blob | null;
  title: string;
  field: GalleryField;
  conference?: string | null;
  year?: number | null;
  notes?: string | null;
}

/**
 * Create a gallery entry: insert the row, upload the image (and PDF if
 * supplied), then update the row with the final storage paths.
 *
 * We have to insert the row first to get an id for the storage path,
 * but we don't know the final path until after the insert, so the flow
 * is: insert with placeholder path → upload with real path → update row
 * to the real path. If either upload step fails we roll back by
 * deleting the row so no orphaned records stay behind.
 */
export async function createGalleryEntry(
  input: CreateGalleryEntryInput,
): Promise<GalleryEntryWithUrls> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw new Error('You need to be signed in to publish to the gallery.');
  }
  const userId = userData.user.id;

  const title = input.title.trim();
  if (title.length === 0) throw new Error('Please add a title.');
  if (title.length > 200) throw new Error('Title is too long (max 200 characters).');

  const { data: inserted, error: insertError } = await db
    .from('gallery_entries')
    .insert({
      user_id: userId,
      source: input.source,
      poster_id: input.poster_id ?? null,
      image_path: 'pending',
      title,
      field: input.field,
      conference: input.conference ?? null,
      year: input.year ?? null,
      notes: input.notes ?? null,
    })
    .select('*')
    .single();

  if (insertError || !inserted) {
    if (insertError?.message.includes('rate_limit_exceeded')) {
      throw new Error('You have reached the daily limit of 5 gallery publishes.');
    }
    throw new Error(`Could not create gallery entry: ${insertError?.message ?? 'unknown'}`);
  }

  const entry = inserted as unknown as GalleryEntry;

  const imagePath = `${userId}/${entry.id}.${input.image_ext}`;
  const pdfPath = input.pdf_file ? `${userId}/${entry.id}.pdf` : null;

  try {
    const { error: imageUploadError } = await supabase.storage
      .from(BUCKET)
      .upload(imagePath, input.image_file, {
        cacheControl: '31536000',
        upsert: false,
        contentType: mimeFromExt(input.image_ext),
      });
    if (imageUploadError) throw imageUploadError;

    if (input.pdf_file && pdfPath) {
      const { error: pdfUploadError } = await supabase.storage
        .from(BUCKET)
        .upload(pdfPath, input.pdf_file, {
          cacheControl: '31536000',
          upsert: false,
          contentType: 'application/pdf',
        });
      if (pdfUploadError) throw pdfUploadError;
    }

    const { data: updated, error: updateError } = await db
      .from('gallery_entries')
      .update({ image_path: imagePath, pdf_path: pdfPath })
      .eq('id', entry.id)
      .select('*')
      .single();
    if (updateError || !updated) throw updateError ?? new Error('update returned no row');

    return withUrls(updated as unknown as GalleryEntry);
  } catch (err) {
    // Roll back: delete any uploaded files then the row itself.
    await supabase.storage.from(BUCKET).remove([imagePath]).catch(() => undefined);
    if (pdfPath) {
      await supabase.storage.from(BUCKET).remove([pdfPath]).catch(() => undefined);
    }
    await db.from('gallery_entries').delete().eq('id', entry.id);
    const msg = err instanceof Error ? err.message : 'unknown error';
    throw new Error(`Upload failed, entry rolled back: ${msg}`);
  }
}

/**
 * Owner-initiated retraction — hard-deletes the row and the storage
 * files. The owner wanted it gone, so the audit trail goes with it.
 * RLS ensures only the owner can reach this.
 */
export async function retractGalleryEntry(entry: GalleryEntry): Promise<void> {
  const files = [entry.image_path];
  if (entry.pdf_path) files.push(entry.pdf_path);
  await supabase.storage.from(BUCKET).remove(files).catch(() => undefined);

  const { error } = await db.from('gallery_entries').delete().eq('id', entry.id);
  if (error) {
    throw new Error(`Could not retract entry: ${error.message}`);
  }
}

// ── Admin-only operations ────────────────────────────────────────────

/**
 * Returns true if the currently signed-in user is on the gallery
 * admin allowlist. Uses the `is_gallery_admin` SECURITY DEFINER RPC
 * so the client never reads auth.users directly.
 */
export async function checkIsGalleryAdmin(): Promise<boolean> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return false;
  const { data, error } = await db.rpc('is_gallery_admin', { uid });
  if (error) return false;
  return data === true;
}

/**
 * Admin listing — every gallery entry including retracted ones.
 * RLS allows this only when is_gallery_admin(auth.uid()) returns true;
 * non-admins will silently get an empty array (RLS filter), so the
 * caller should always gate navigation through AdminGuard.
 */
export async function listAllGalleryAdmin(): Promise<GalleryEntryWithUrls[]> {
  const { data, error } = await db
    .from('gallery_entries')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    throw new Error(`Could not load admin gallery: ${error.message}`);
  }
  return ((data ?? []) as unknown as GalleryEntry[]).map(withUrls);
}

/**
 * Soft-retract an entry as a moderator. Sets retracted_at +
 * retracted_by + retraction_reason. Files are left in the bucket so
 * the action is reversible via adminUnretract().
 */
export async function adminRetractEntry(
  entryId: string,
  reason: string,
): Promise<void> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw new Error('You need to be signed in as an admin.');
  }
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    throw new Error('A retraction reason is required.');
  }
  if (trimmed.length > 500) {
    throw new Error('Reason is too long (max 500 characters).');
  }
  const { error } = await db
    .from('gallery_entries')
    .update({
      retracted_at: new Date().toISOString(),
      retracted_by: userData.user.id,
      retraction_reason: trimmed,
    })
    .eq('id', entryId);
  if (error) {
    throw new Error(`Could not retract entry: ${error.message}`);
  }
}

/**
 * Reverse a moderator retraction. Clears retracted_at / _by / _reason
 * so the row reappears in the public listing.
 */
export async function adminUnretractEntry(entryId: string): Promise<void> {
  const { error } = await db
    .from('gallery_entries')
    .update({
      retracted_at: null,
      retracted_by: null,
      retraction_reason: null,
    })
    .eq('id', entryId);
  if (error) {
    throw new Error(`Could not unretract entry: ${error.message}`);
  }
}

function mimeFromExt(ext: CreateGalleryEntryInput['image_ext']): string {
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
  }
}
