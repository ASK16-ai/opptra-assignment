/* Tiny localStorage-backed useState. Reads on mount, writes on every
   change. Defensive against SSR (Next.js renders server-side first) and
   against quota / private-mode errors. */

import { useEffect, useState } from "react";

export function usePersistedState(key, initial) {
  const [val, setVal] = useState(initial);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage after mount so server-rendered HTML matches.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw != null) {
        setVal(JSON.parse(raw));
      }
    } catch {
      /* Ignore — fall back to initial */
    }
    setHydrated(true);
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(val));
    } catch {
      /* quota / private mode — silently drop */
    }
  }, [key, val, hydrated]);

  return [val, setVal];
}
