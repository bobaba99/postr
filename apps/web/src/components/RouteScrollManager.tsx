import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router';

/**
 * Starts new routes at the top without defeating native Back/Forward
 * restoration. Hash navigation keeps its own target behavior.
 */
export function RouteScrollManager() {
  const location = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType === 'POP' || location.hash) return;

    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.hash, location.key, navigationType]);

  return null;
}
