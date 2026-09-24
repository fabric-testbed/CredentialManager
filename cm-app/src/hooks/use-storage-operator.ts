"use client";

/**
 * Whether the signed-in person may administer storage.
 *
 * Deliberately the same rule the Ceph Manager enforces in `authorize()` - a
 * facility administrator, or an owner of the storage service project - so the
 * navigation cannot offer a page the server will refuse.
 *
 * Kept separate from `useStorageSession`, which also mints a token and loads
 * clusters. The header needs the answer and none of that work, and it renders
 * on every page.
 */
import { useEffect, useState } from "react";

import { isStorageProjectOwnerRole } from "@/lib/config";
import { getPerson } from "@/services/core-api-service";

/**
 * Keyed by user, not a bare flag.
 *
 * Logging out clears `cmUserID` and `cmUserStatus` but not this, so a shared
 * cache would let an administrator log out, a non-administrator log in to the
 * same tab, and the Storage Admin link stay visible. The server still refuses
 * them, but offering a link that 401s is the exact thing this hook exists to
 * avoid. Including the uuid means a different user simply cannot read the
 * previous user's answer, whatever logout forgets to clear.
 */
function cacheKey(userId: string): string {
  return `cmStorageOperator:${userId}`;
}

const FACILITY_ROLES = [
  "facility-operators",
  "facility-operator",
  "Facility Operators",
];

export function useStorageOperator(enabled: boolean): boolean {
  const [isOperator, setIsOperator] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const userId = sessionStorage.getItem("cmUserID");
    if (!userId) return false;
    return sessionStorage.getItem(cacheKey(userId)) === "true";
  });

  useEffect(() => {
    if (!enabled) return;
    // Cached for the session: the roles do not change mid-session, and the
    // header would otherwise re-ask on every navigation. The initial state
    // already read this, so there is nothing to set here - and setting state
    // synchronously inside an effect is a lint error besides.
    const cachedFor = sessionStorage.getItem("cmUserID");
    if (cachedFor && sessionStorage.getItem(cacheKey(cachedFor)) !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const userId = sessionStorage.getItem("cmUserID");
        if (!userId) return;
        const { data } = await getPerson(userId);
        const roles: Array<{ name: string }> = data.results?.[0]?.roles ?? [];
        const operator =
          roles.some((r) => FACILITY_ROLES.includes(r.name)) ||
          roles.some((r) => isStorageProjectOwnerRole(r.name));
        if (cancelled) return;
        sessionStorage.setItem(cacheKey(userId), String(operator));
        setIsOperator(operator);
      } catch {
        // A failed lookup hides the link rather than showing one that 401s.
        if (!cancelled) setIsOperator(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return isOperator;
}
