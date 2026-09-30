/**
 * useSignedInUserId — the id of the user the Supabase client is signed in
 * as, kept current as the session changes.
 *
 * `undefined` until the client has answered, `null` with no session. It
 * changes only when the id changes: a token refresh for the same user
 * re-renders nothing. The editor uses it to open only the user's own posters
 * and to close one when the signed-in user changes (a sign-in to another
 * account in another tab, or a lost session replaced by a new guest;
 * docs/fixes/23-new-poster-owner-only.md).
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export function useSignedInUserId(): string | null | undefined {
  const [userId, setUserId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setUserId(data.session?.user.id ?? null);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setUserId(session?.user.id ?? null);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return userId;
}
