/**
 * Fetching the storage-user list, completely or not at all.
 *
 * `/project/members` has two traps, both load-bearing for anything that then
 * resolves a project against this list:
 *
 *  - `offset` indexes the membership-uuid list, not the returned rows, and rows
 *    are dropped *within* a page (a member with no bastion_login, or a lookup
 *    that failed). So a full page routinely comes back short, and "a short page
 *    means the last page" truncates silently.
 *  - `total` counts memberships, not returned members, so it can never be
 *    reached by accumulating rows.
 *
 * Advance by the page size the server says it used, stop on `total`, and only
 * claim completeness once `offset` has passed it. Everything else reports
 * `complete: false`, which callers must treat as "refuse", not "proceed".
 */
import type { StorageUser } from "./principals";

export interface MembersPage {
  data?: StorageUser[];
  total?: number;
  limit?: number;
}

export interface StorageUserFetch {
  users: StorageUser[];
  complete: boolean;
  /** Why completeness could not be established, for the operator to see. */
  reason?: string;
}

const RUNAWAY_GUARD = 100_000;

export async function fetchStorageUsers(
  getPage: (offset: number, limit: number) => Promise<MembersPage>,
  pageSize = 200
): Promise<StorageUserFetch> {
  const users: StorageUser[] = [];
  let offset = 0;
  let reportedTotal: number | undefined;
  let sawUnboundedPage = false;

  for (;;) {
    const page = await getPage(offset, pageSize);
    const rows = Array.isArray(page.data) ? page.data : [];
    users.push(...rows);

    if (typeof page.total === "number") reportedTotal = page.total;
    const step = typeof page.limit === "number" && page.limit > 0 ? page.limit : pageSize;
    offset += step;

    if (reportedTotal === undefined) {
      // Nothing to check against; the only safe stop is an empty page, and
      // completeness cannot be proven from that.
      sawUnboundedPage = true;
      if (rows.length === 0) break;
    } else if (offset >= reportedTotal) {
      break;
    }

    if (offset > RUNAWAY_GUARD) break;
  }

  const complete = reportedTotal !== undefined && offset >= reportedTotal;
  return {
    users,
    complete,
    reason: complete
      ? undefined
      : sawUnboundedPage
      ? "The server reported no total, so the list cannot be proven complete."
      : "The list stopped before the reported total.",
  };
}
