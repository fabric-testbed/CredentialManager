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
  // Verbatim shape from /s3/bucket on east. Usage is `size_kb`, and it is
  // ABSENT on an empty bucket rather than zero.
  const buckets = [
    {
      name: "komal2",
      owner: "alice_0001",
      num_objects: 1,
      size_kb: 4,
      quota: { enabled: true, max_size_kb: 5242880 },
    },
    { name: "komal1", owner: "bob_0002", quota: { enabled: true, max_size_kb: 1048576 } },
  ];

  it("gives a person their own buckets", () => {
    expect(
      bucketsFor({ kind: "user", uuid: "u", name: "A", login: "alice_0001" }, buckets)
        .map((b) => b.name)
    ).toEqual(["komal2"]);
  });

  it("reads usage from size_kb, not a `size` field the API never sends", () => {
    const [b] = bucketsFor(
      { kind: "user", uuid: "u", name: "A", login: "alice_0001" },
      buckets
    );
    expect(b.sizeBytes).toBe(4 * 1024);
    expect(b.quotaBytes).toBe(5242880 * 1024);
    expect(b.numObjects).toBe(1);
  });

  it("reports an empty bucket as empty, not as unknown", () => {
    // komal1 sends no size_kb at all. That means nothing has been written,
    // which is a different statement from "we could not find out".
    const [b] = bucketsFor(
      { kind: "user", uuid: "u", name: "B", login: "bob_0002" },
      buckets
    );
    expect(b.sizeBytes).toBe(0);
    expect(b.numObjects).toBe(0);
    expect(b.quotaBytes).toBe(1048576 * 1024);
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


describe("subvolumes with no group (/volumes/_nogroup)", () => {
  // Real: on asia, kthare10_0011904101 is at
  // /volumes/_nogroup/kthare10_0011904101/4575731b-…, while every other
  // personal volume is under fabric_users. The GUI shows its group as "—".
  const asia = [
    {
      name: "kthare10_0011904101",
      group_name: null as unknown as undefined,
      path: "/volumes/_nogroup/kthare10_0011904101/4575731b-189b-40fc-ba68-9dbace5423d6",
      bytes_quota: 1073741824,
    },
    { name: "bill_howard_0000334495", group_name: "fabric_users" },
  ];
  const komal = {
    kind: "user" as const,
    uuid: "u-komal",
    name: "Komal",
    login: "kthare10_0011904101",
  };

  it("does not relabel an ungrouped volume as a user-group volume", () => {
    const [v] = volumesFor(komal, asia);
    expect(v.group).toBe("_nogroup");
    expect(v.ungrouped).toBe(true);
  });

  it("still attributes it to the person it is named for", () => {
    expect(volumesFor(komal, asia).map((v) => v.name)).toEqual([
      "kthare10_0011904101",
    ]);
  });

  it("does not hand an ungrouped volume to a project", () => {
    const rows = volumesFor(
      { kind: "project", uuid: "b9847fa1-13ef-49f9-9e07-ae6ad06cda3f", name: "p" },
      asia
    );
    expect(rows).toEqual([]);
  });

  it("finds capabilities under _nogroup, not only under fabric_users", () => {
    // Coercing the group to fabric_users files the volume under the right
    // person and then searches the wrong path prefix, so a granted volume
    // reads as reachable by nobody.
    const entity: CephEntity = {
      user_entity: "client.kthare10_0011904101",
      capabilities: [
        {
          entity: "mds",
          cap: "allow rw fsname=CEPH-FS-01 path=/volumes/_nogroup/kthare10_0011904101/4575731b",
        },
      ],
    };
    const rows = accessTo(komal, [entity], new Map());
    expect(rows).toHaveLength(1);
    expect(rows[0].grant.group).toBe("_nogroup");
    expect(rows[0].grant.volume).toBe("kthare10_0011904101");
  });

  it("does not let one person's _nogroup volume appear under another person", () => {
    const entity: CephEntity = {
      user_entity: "client.someone_else",
      capabilities: [
        {
          entity: "mds",
          cap: "allow rw fsname=CEPH-FS-01 path=/volumes/_nogroup/someone_else/abc",
        },
      ],
    };
    expect(accessTo(komal, [entity], new Map())).toEqual([]);
  });
});
