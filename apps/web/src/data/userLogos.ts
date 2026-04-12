/**
 * User logo library — client helpers for `public.user_logos` +
 * the `user-logos` Supabase storage bucket.
 *
 * Users upload a logo file once via the LogoPicker's Upload tab,
 * and the file lives under `{user_id}/{logo_id}.{ext}` in the
 * `user-logos` bucket with a row in `public.user_logos` holding
 * its display name + storage path. The picker's "My Logos" tab
 * re-fetches the list + signed URLs each time it opens so recent
 * uploads show up immediately across tabs.
 *
 * Storage model:
 *
 *   user-logos/
 *     {user_id}/
 *       {logo_id}.{ext}
 *
 * RLS (on both the table AND storage.objects) scopes reads and
 * writes to the owning user — see migration
 * `20260411050000_user_logos.sql` for the policies. The per-user
 * cap of 25 logos is enforced server-side via a BEFORE INSERT
 * trigger; we also surface a friendly error from this client if
 * the trigger rejects.
 */
import { supabase } from '@/lib/supabase';

export interface UserLogo {
  id: string;
  name: string;
  storagePath: string;
  createdAt: string;
  /** Signed URL generated at fetch time — do NOT cache. */
  signedUrl: string;
}

const BUCKET = 'user-logos';
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

/** Allowed image types + size cap (matches the inline upload path). */
const ALLOWED_MIME = /^image\//;
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function extensionFor(file: File): string {
  const m = file.name.match(/\.([a-zA-Z0-9]+)$/);
  if (m) return m[1]!.toLowerCase();
  // Fall back to MIME — 'image/png' → 'png'
  const slash = file.type.indexOf('/');
  return slash > 0 ? file.type.slice(slash + 1).toLowerCase() : 'png';
}

/**
 * Upload a logo file to the user's library. Returns the inserted
 * row with a fresh signed URL.
 */
export async function uploadUserLogo(
  file: File,
  name: string,
): Promise<UserLogo> {
  if (!ALLOWED_MIME.test(file.type)) {
    throw new Error(
      `"${file.name}" isn't an image. Upload PNG, JPEG, SVG, or WebP.`,
    );
  }
  if (file.size > MAX_BYTES) {
    throw new Error(
      `"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB — logos must be under 10 MB.`,
    );
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  // Path inside the bucket. First segment = user id so the
  // storage RLS policy can check ownership without another
  // round-trip to the table. We don't know the logo_id yet
  // (Postgres generates it on insert), so we use a
  // crypto-random prefix instead.
  const randomId = crypto.randomUUID();
  const ext = extensionFor(file);
  const storagePath = `${user.id}/${randomId}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    });
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

  // The generated Supabase types don't know about `user_logos`
  // yet (the migration landed after `npm run gen-types` was last
  // run). Cast to `any` at the insert so TS lets us pass the row
  // shape; we re-tighten the type on the result with a manual
  // cast below.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insertResult = await (supabase as any)
    .from('user_logos')
    .insert({
      user_id: user.id,
      name: name.trim() || file.name,
      storage_path: storagePath,
    })
    .select()
    .single();
  const row = insertResult.data as
    | {
        id: string;
        name: string;
        storage_path: string;
        created_at: string;
      }
    | null;
  const insErr = insertResult.error as { message: string } | null;
  if (insErr || !row) {
    // Roll back the orphaned file so the user doesn't rack up
    // storage against a row that never got created.
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw new Error(insErr?.message ?? 'Failed to save logo metadata.');
  }

  const signed = await signedUrlFor(row.storage_path);
  return {
    id: row.id,
    name: row.name,
    storagePath: row.storage_path,
    createdAt: row.created_at,
    signedUrl: signed,
  };
}

/** List all logos owned by the current user, newest first. */
export async function listUserLogos(): Promise<UserLogo[]> {
  // See comment on `uploadUserLogo` — generated types lag the
  // migration so we cast to `any` for the select and manually
  // shape the result.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('user_logos')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  const rows =
    (data as unknown as Array<{
      id: string;
      name: string;
      storage_path: string;
      created_at: string;
    }>) ?? [];

  // Batch the signed-URL requests. Supabase Storage doesn't have a
  // bulk endpoint so we fan out, but for realistic counts (<25)
  // this is fast.
  const logos = await Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      name: r.name,
      storagePath: r.storage_path,
      createdAt: r.created_at,
      signedUrl: await signedUrlFor(r.storage_path),
    })),
  );
  return logos;
}

/** Delete a logo + its file from storage. */
export async function deleteUserLogo(logo: UserLogo): Promise<void> {
  // Delete storage first so a failed DB delete doesn't leave an
  // orphaned row pointing at nothing. Conversely, if the DB
  // delete fails after storage is gone, the user can retry and
  // the row still gets cleaned up — no data loss either way.
  const { error: storageErr } = await supabase.storage
    .from(BUCKET)
    .remove([logo.storagePath]);
  if (storageErr) throw new Error(`Storage delete failed: ${storageErr.message}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: dbErr } = await (supabase as any)
    .from('user_logos')
    .delete()
    .eq('id', logo.id);
  if (dbErr) throw new Error(dbErr.message);
}

async function signedUrlFor(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    throw new Error(
      `Couldn't create signed URL for ${storagePath}: ${error?.message ?? 'unknown error'}`,
    );
  }
  return data.signedUrl;
}
