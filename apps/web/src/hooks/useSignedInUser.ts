/**
 * useSignedInUser — the user the Supabase client is signed in as, and
 * whether it is a guest, kept current as the session changes.
 *
 * `undefined` until the client has answered, `null` with no session. It
 * changes only when the id or the guest flag changes: a token refresh for
 * the same user re-renders nothing. The editor uses it to open only the
 * user's own posters and to close one when the signed-in user changes (a
 * sign-in to another account in another tab, or a lost session replaced by
 * a new guest; docs/fixes/23-new-poster-owner-only.md).
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface SignedInUser {
  id: string;
  /** A guest: an anonymous session, which cannot be signed in to again once it ends. */
  isGuest: boolean;
}

type SessionUser = { id: string; is_anonymous?: boolean } | undefined;

export function useSignedInUser(): SignedInUser | null | undefined {
  const [user, setUser] = useState<SignedInUser | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    const follow = (next: SessionUser) => {
      if (!active) return;
      setUser((prev) => {
        if (!next) return null;
        const isGuest = next.is_anonymous === true;
        return prev && prev.id === next.id && prev.isGuest === isGuest ? prev : { id: next.id, isGuest };
      });
    };
    void supabase.auth.getSession().then(({ data }) => follow(data.session?.user));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => follow(session?.user));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return user;
}
