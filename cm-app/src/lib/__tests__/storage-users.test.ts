import { describe, expect, it, vi } from "vitest";
import { fetchStorageUsers, MembersPage } from "../storage-users";

/** A server holding `total` memberships, `missing` of which yield no row. */
function server(total: number, missing: number, opts: { sendTotal?: boolean } = {}) {
  const sendTotal = opts.sendTotal ?? true;
  const dropped = new Set(Array.from({ length: missing }, (_, i) => i * 7));
  return vi.fn(async (offset: number, limit: number): Promise<MembersPage> => {
    const data = [];
    for (let i = offset; i < Math.min(offset + limit, total); i++) {
      if (dropped.has(i)) continue; // no bastion_login: row omitted mid-page
      data.push({ uuid: `u-${i}`, bastion_login: `login_${i}` });
    }
    return { data, limit, ...(sendTotal ? { total } : {}) };
  });
}

describe("paging the storage-user list", () => {
  it("collects every member despite pages coming back short", async () => {
    // 276 memberships, 40 of them yielding no row -> 236 real members.
    const r = await fetchStorageUsers(server(276, 40), 50);
    expect(r.users).toHaveLength(236);
    expect(r.complete).toBe(true);
  });

  it("does not stop on a short page", async () => {
    const get = server(276, 40);
    await fetchStorageUsers(get, 50);
    // 276/50 -> 6 pages. Stopping at the first short one would be far fewer.
    expect(get).toHaveBeenCalledTimes(6);
  });

  it("refuses to claim completeness when no total is sent", async () => {
    const r = await fetchStorageUsers(server(276, 0, { sendTotal: false }), 50);
    expect(r.users).toHaveLength(276);
    expect(r.complete).toBe(false);
    expect(r.reason).toMatch(/no total/);
  });

  it("advances by the page size the server actually used", async () => {
    // Server ignores the requested limit and uses 25.
    const get = vi.fn(async (offset: number): Promise<MembersPage> => ({
      data: offset < 100 ? [{ uuid: `u-${offset}`, bastion_login: `l_${offset}` }] : [],
      limit: 25,
      total: 100,
    }));
    const r = await fetchStorageUsers(get, 200);
    expect(get).toHaveBeenCalledTimes(4); // 0,25,50,75 -> offset 100 == total
    expect(r.complete).toBe(true);
  });

  it("is complete but empty when there are no members at all", async () => {
    const r = await fetchStorageUsers(server(0, 0), 50);
    expect(r.users).toEqual([]);
    expect(r.complete).toBe(true);
  });
});
