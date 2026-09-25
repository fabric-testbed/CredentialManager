/**
 * Matching exposures to volumes.
 *
 * A subvolume is identified by (cluster, group, name) and the same NAME occurs
 * in different groups - a person's volume in `fabric_users` and a project's in
 * the project's uuid. Matching on the name alone would show one volume's Globus
 * status against another's row, which is the kind of wrong that looks right.
 */
import { describe, expect, it } from "vitest";

import { dtnCanMount, exposuresForVolume, liveExposure, needsDtnGrant } from "../globus-exposure";
import type { CephEntity } from "../ceph-caps";

import type { VolumeExposure } from "../../services/globus-service";

const NRIG = "c93fe500-bdc7-48d7-89c7-a3103becf5f3";

function exposure(over: Partial<VolumeExposure>): VolumeExposure {
  return {
    cluster: "west",
    group_name: NRIG,
    subvol_name: "nrig",
    site: "UCSD",
    owner_kind: "project",
    owner_uuid: NRIG,
    collection_id: "b6ebda1c-3ea8-4da8-81d2-f57df0475922",
    mount_path: "/ceph/west/projects/nrig",
    state: "active",
    detail: null,
    requested_by: "someone@example.org",
    requested_at: "2026-09-24T20:42:59.019475+00:00",
    converged_at: "2026-09-25T00:02:39.267744+00:00",
    ...over,
  };
}

describe("finding a volume's exposures", () => {
  const all = [
    exposure({}),
    exposure({ group_name: "fabric_users", subvol_name: "nrig", owner_kind: "user" }),
    exposure({ cluster: "east" }),
    exposure({ subvol_name: "other" }),
  ];

  it("matches on cluster, group and name together", () => {
    const got = exposuresForVolume(all, "west", NRIG, "nrig");
    expect(got).toHaveLength(1);
    expect(got[0].owner_kind).toBe("project");
  });

  it("does not confuse a personal volume with a project volume of the same name", () => {
    const got = exposuresForVolume(all, "west", "fabric_users", "nrig");
    expect(got).toHaveLength(1);
    expect(got[0].owner_kind).toBe("user");
  });

  it("does not leak an exposure from another cluster", () => {
    expect(exposuresForVolume(all, "asia", NRIG, "nrig")).toEqual([]);
  });

  it("returns nothing for a volume that was never published", () => {
    expect(exposuresForVolume(all, "west", NRIG, "unpublished")).toEqual([]);
  });

  it("returns every site a volume is published at", () => {
    const two = [exposure({}), exposure({ site: "STAR" })];
    expect(exposuresForVolume(two, "west", NRIG, "nrig").map((e) => e.site)).toEqual([
      "UCSD",
      "STAR",
    ]);
  });
});


describe("which exposure Withdraw acts on", () => {
  it("ignores one already being withdrawn", () => {
    // Offering Withdraw again would send a second request for something the
    // agent has not finished tearing down.
    expect(liveExposure([exposure({ state: "removing" })])).toBeUndefined();
  });

  it("picks an active one", () => {
    expect(liveExposure([exposure({ state: "active" })])?.state).toBe("active");
  });

  it("picks a failed one, which is still a live request", () => {
    expect(liveExposure([exposure({ state: "failed" })])?.state).toBe("failed");
  });
});


describe("when to offer the DTN grant", () => {
  it("offers it for the not-mounted failure, which a grant fixes", () => {
    expect(
      needsDtnGrant(exposure({
        state: "failed",
        detail:
          "/ceph/west/projects/nsf-ci-compass is not mounted. Most often the DTN's " +
          "cephx key has no grant for this subvolume group - check the client's mds caps.",
      }))
    ).toBe(true);
  });

  it("does not offer it for a failure a grant would not fix", () => {
    // Offering a fix that cannot work is worse than offering none: it sends
    // the operator down the wrong path and makes the real cause harder to see.
    expect(
      needsDtnGrant(exposure({ state: "failed", detail: "collection step failed (rc=1)" }))
    ).toBe(false);
  });

  it("does not offer it while the volume is working or pending", () => {
    for (const state of ["active", "requested", "removing"] as const) {
      expect(needsDtnGrant(exposure({ state, detail: "is not mounted" }))).toBe(false);
    }
  });
});


describe("whether the DTN can already mount a volume", () => {
  const dtn = (paths: string[]): CephEntity => ({
    user_entity: "client.globus-dtn",
    capabilities: [
      { entity: "mds", cap: paths.map((p) => `allow rw fsname=CEPH-FS-01 path=${p}`).join(", ") },
    ],
  });

  it("is true for a group-scoped grant, which covers volumes made later", () => {
    expect(dtnCanMount([dtn([`/volumes/${NRIG}`])], NRIG, "nrig")).toBe(true);
    expect(dtnCanMount([dtn([`/volumes/${NRIG}`])], NRIG, "made-later")).toBe(true);
  });

  it("is true for a volume-scoped grant on that volume only", () => {
    const caps = [dtn([`/volumes/${NRIG}/nrig/abc`])];
    expect(dtnCanMount(caps, NRIG, "nrig")).toBe(true);
    expect(dtnCanMount(caps, NRIG, "other")).toBe(false);
  });

  it("is false for a different group", () => {
    // The real case: fabric_users and NRIG are granted, a new project is not.
    const caps = [dtn(["/volumes/fabric_users", `/volumes/${NRIG}`])];
    expect(dtnCanMount(caps, "c768a8b8-a19b-4366-be8c-e735dcccb027", "nsf-ci-compass"))
      .toBe(false);
  });

  it("is false when the DTN has no cephx entity at all", () => {
    expect(dtnCanMount([], NRIG, "nrig")).toBe(false);
    expect(dtnCanMount([{ user_entity: "client.someone", capabilities: [] }], NRIG, "nrig"))
      .toBe(false);
  });

  it("does not count another entity's grant as the DTN's", () => {
    const other: CephEntity = {
      user_entity: "client.alice",
      capabilities: [{ entity: "mds", cap: `allow rw fsname=X path=/volumes/${NRIG}` }],
    };
    expect(dtnCanMount([other], NRIG, "nrig")).toBe(false);
  });
});
