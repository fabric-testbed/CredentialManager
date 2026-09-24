/**
 * The resolution that the 2026-09-23 incident turned on.
 *
 * `/project/members` answers for the Ceph *service* project - everyone who has
 * storage - so treating it as a project's membership granted an NRIG volume to
 * 276 accounts instead of 5. These tests pin the shape of the answer, including
 * the parts that must be reported rather than dropped.
 */
import { describe, expect, it } from "vitest";
import fixture from "./fixtures-west-cephx.json";
import { CephEntity } from "../ceph-caps";
import {
  accessTo,
  bucketsFor,
  ProjectDetail,
  projectMemberUuids,
  resolveProjectGrantees,
  StorageUser,
  volumesFor,
} from "../principals";

const NRIG = "c93fe500-bdc7-48d7-89c7-a3103becf5f3";
const entities = (fixture as { data: CephEntity[] }).data;

const project: ProjectDetail = {
  uuid: NRIG,
  name: "NRIG Research",
  project_members: [{ uuid: "u-ashok", name: "Ashok" }, { uuid: "u-nostorage", name: "New Person" }],
  project_owners: [{ uuid: "u-komal", name: "Komal" }],
  project_creators: [{ uuid: "u-komal", name: "Komal" }], // duplicate on purpose
};

const storageUsers: StorageUser[] = [
  { uuid: "u-ashok", bastion_login: "ashok_0000002198", name: "Ashok" },
  { uuid: "u-komal", bastion_login: "kthare10_0011904101", name: "Komal" },
  // 274 other people who have storage and are NOT in this project
  ...Array.from({ length: 274 }, (_, i) => ({
    uuid: `u-other-${i}`,
    bastion_login: `other_${i}`,
  })),
];

describe("resolving who a project action touches", () => {
  it("counts a person once however many roles they hold", () => {
    expect(projectMemberUuids(project).size).toBe(3);
  });

  it("resolves to the project's members, not to everyone with storage", () => {
    const r = resolveProjectGrantees(project, storageUsers, true);
    expect(storageUsers).toHaveLength(276);
    expect(r.granted.map((g) => g.bastion_login).sort()).toEqual([
      "ashok_0000002198",
      "kthare10_0011904101",
    ]);
  });

  it("names members who have no storage instead of dropping them", () => {
    const r = resolveProjectGrantees(project, storageUsers, true);
    expect(r.withoutStorage).toEqual([{ uuid: "u-nostorage", name: "New Person" }]);
    expect(r.memberCount).toBe(3);
    // The two numbers must not be conflated: 3 members, 2 reachable.
    expect(r.granted.length).toBeLessThan(r.memberCount);
  });

  it("carries the incompleteness forward so callers can refuse", () => {
    // Acting on a subset of unknown size is the same bug as acting on everyone.
    expect(resolveProjectGrantees(project, storageUsers, false).complete).toBe(false);
  });

  it("resolves to nobody rather than everybody when membership is empty", () => {
    const r = resolveProjectGrantees({ uuid: NRIG }, storageUsers, true);
    expect(r.granted).toEqual([]);
    expect(r.memberCount).toBe(0);
  });
});

describe("a principal's volumes", () => {
  const subvols = [
    { name: "alice_0001", group_name: "fabric_users", bytes_quota: 10737418240 },
    { name: "bob_0002", group_name: "fabric_users" },
    { name: "nrig", group_name: NRIG, bytes_quota: "107374182400" },
  ];

  it("gives a person only their own volume", () => {
    const v = volumesFor(
      { kind: "user", uuid: "u", name: "Alice", login: "alice_0001" },
      subvols
    );
    expect(v.map((x) => x.name)).toEqual(["alice_0001"]);
    expect(v[0].shared).toBe(false);
    expect(v[0].bytesQuota).toBe(10737418240);
  });

  it("gives a project every volume in its group, quota parsed from a string", () => {
    const v = volumesFor({ kind: "project", uuid: NRIG, name: "NRIG Research" }, subvols);
    expect(v.map((x) => x.name)).toEqual(["nrig"]);
    expect(v[0].shared).toBe(true);
    expect(v[0].bytesQuota).toBe(107374182400);
  });

  it("does not match a personal volume that merely shares a name with a project", () => {
    const v = volumesFor({ kind: "project", uuid: "fabric_users", name: "x" }, subvols);
    // A project whose uuid somehow equalled the user group would otherwise
    // inherit all 2 personal volumes.
    expect(v).toHaveLength(2);
    expect(v.every((x) => x.shared)).toBe(true);
  });
});

describe("who can reach a principal's storage", () => {
  const people = new Map<string, StorageUser>([
    ["pruth_0031379841", { uuid: "u-p", bastion_login: "pruth_0031379841", name: "Paul Ruth" }],
  ]);

  it("lists the real holders of a project volume from live caps", () => {
    const rows = accessTo(
      { kind: "project", uuid: NRIG, name: "NRIG Research" },
      entities,
      people
    );
    // Four people plus the Globus DTN key. Note ashok_0000002198 is an NRIG
    // member and is NOT here - they cannot mount the volume in a slice. That
    // is the question the old UI could not answer without reading 123 cap
    // strings by hand.
    expect(rows.map((r) => r.login).sort()).toEqual([
      "globus-dtn",
      "kthare10_0000001692",
      "kthare10_0011904101",
      "paul_ruth_0050553627",
      "pruth_0031379841",
    ]);
    expect(rows.find((r) => r.login === "pruth_0031379841")?.person).toBe("Paul Ruth");
  });

  it("marks the DTN's grant as covering the whole group", () => {
    const rows = accessTo({ kind: "project", uuid: NRIG, name: "x" }, entities, people);
    const dtn = rows.find((r) => r.login === "globus-dtn");
    expect(dtn?.grant.scope).toBe("group");
  });

  it("does not report every personal-volume holder as reaching one person", () => {
    const rows = accessTo(
      { kind: "user", uuid: "u", name: "A", login: "akh7bs_0000373333" },
      entities,
      people
    );
    // 89 entities hold a grant somewhere in fabric_users. Only one names this
    // volume - plus the Globus DTN, whose grant is the whole group and so
    // genuinely does reach it. Surfacing that is the point: a group-scoped
    // grant is invisible when you read cap strings one at a time.
    expect(rows.map((r) => r.login).sort()).toEqual([
      "akh7bs_0000373333",
      "globus-dtn",
    ]);
    const own = rows.find((r) => r.login === "akh7bs_0000373333");
    expect(own?.grant.scope).toBe("volume");
    expect(own?.grant.volume).toBe("akh7bs_0000373333");
    expect(rows.find((r) => r.login === "globus-dtn")?.grant.scope).toBe("group");
  });

  it("does not leak one person's volume into another person's access list", () => {
    const rows = accessTo(
      { kind: "user", uuid: "u", name: "B", login: "demersn_0000449852" },
      entities,
      people
    );
    expect(rows.some((r) => r.login === "akh7bs_0000373333")).toBe(false);
  });
});

describe("buckets", () => {
  const buckets = [
    { bucket: "alice-data", owner: "alice_0001", size: 100 },
    { bucket: "bob-data", owner: "bob_0002" },
  ];

  it("gives a person their own buckets", () => {
    expect(
      bucketsFor({ kind: "user", uuid: "u", name: "A", login: "alice_0001" }, buckets)
        .map((b) => b.name)
    ).toEqual(["alice-data"]);
  });

  it("attributes a project's buckets to the member who owns them", () => {
    const rows = bucketsFor(
      { kind: "project", uuid: NRIG, name: "NRIG" },
      buckets,
      ["alice_0001", "bob_0002"]
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].viaMember).toBe("alice_0001");
  });

  it("shows a project no buckets when it has no members with storage", () => {
    expect(bucketsFor({ kind: "project", uuid: NRIG, name: "NRIG" }, buckets, [])).toEqual([]);
  });
});
