/**
 * The fixture is a real listing of all 123 cephx entities on the west cluster,
 * not hand-written strings. A parser tested only against examples someone
 * invented agrees with the person who invented them.
 */
import { describe, expect, it } from "vitest";
import fixture from "./fixtures-west-cephx.json";
import {
  CephEntity,
  describeAccess,
  effectiveAccess,
  isBroadGrant,
  keyFromKeyring,
  loginFromEntity,
  parseKeyring,
  parseClause,
  splitClauses,
} from "../ceph-caps";

const entities = (fixture as { data: CephEntity[] }).data;
const byEntity = (name: string) =>
  entities.find((e) => e.user_entity === name) as CephEntity;

describe("parsing real capabilities", () => {
  it("reads a personal volume grant", () => {
    const [a] = effectiveAccess(byEntity("client.akh7bs_0000373333"));
    expect(a.mode).toBe("read-write");
    expect(a.scope).toBe("volume");
    expect(a.group).toBe("fabric_users");
    expect(a.volume).toBe("akh7bs_0000373333");
    expect(a.fsname).toBe("CEPH-FS-01");
  });

  it("splits a multi-clause cap into separate grants", () => {
    const access = effectiveAccess(byEntity("client.pruth_0031379841"));
    expect(access).toHaveLength(2);
    expect(access.map((a) => a.volume).sort()).toEqual([
      "nrig",
      "pruth_0031379841",
    ]);
  });

  it("distinguishes a whole-group grant from a single volume", () => {
    // The DTN key holds both: one project group entire, and all personal
    // volumes. These look almost identical as raw strings.
    const access = effectiveAccess(byEntity("client.globus-dtn"));
    expect(access.every((a) => a.scope === "group")).toBe(true);
    expect(access.every(isBroadGrant)).toBe(true);
  });

  it("never reports mon or osd caps as filesystem access", () => {
    const mon = entities.find((e) =>
      (e.capabilities ?? []).some((c) => c.entity === "mon" && c.cap === "allow *")
    );
    expect(mon).toBeTruthy();
    expect(effectiveAccess(mon as CephEntity)).toEqual([]);
  });

  it("parses every entity on the cluster without throwing or guessing", () => {
    let grants = 0;
    for (const e of entities) {
      for (const a of effectiveAccess(e)) {
        grants++;
        expect(a.mode).not.toBe("other");
        expect(a.scope).not.toBe("other");
        expect(a.path.startsWith("/")).toBe(true);
      }
    }
    // 89 single-volume users + 3 entities holding two clauses.
    expect(grants).toBe(92);
  });
});

describe("describing access", () => {
  const names = { "c93fe500-bdc7-48d7-89c7-a3103becf5f3": "NRIG Research" };

  it("names the project rather than printing its uuid", () => {
    const a = parseClause(
      "allow rw fsname=CEPH-FS-01 path=/volumes/c93fe500-bdc7-48d7-89c7-a3103becf5f3/nrig/d112dee5"
    );
    expect(describeAccess(a, { projectNames: names })).toBe(
      "read-write on nrig (NRIG Research)"
    );
  });

  it("says EVERY volume when the grant covers a whole group", () => {
    const a = parseClause(
      "allow rw fsname=CEPH-FS-01 path=/volumes/c93fe500-bdc7-48d7-89c7-a3103becf5f3"
    );
    expect(describeAccess(a, { projectNames: names })).toBe(
      "read-write on EVERY volume in NRIG Research"
    );
  });

  it("does not silently degrade an unknown project to nothing", () => {
    const a = parseClause("allow rw fsname=CEPH-FS-01 path=/volumes/unknown-uuid/vol/id");
    expect(describeAccess(a)).toContain("unknown-uuid");
  });

  it("reads a personal volume as personal", () => {
    const a = parseClause(
      "allow rw fsname=CEPH-FS-01 path=/volumes/fabric_users/alice_0001/abc"
    );
    expect(describeAccess(a)).toBe("read-write on alice_0001 (personal volume)");
  });
});

describe("edge cases that would misread as narrower than they are", () => {
  it("treats read-only as read-only", () => {
    expect(parseClause("allow r fsname=X path=/volumes/g/v/i").mode).toBe("read-only");
  });

  it("treats allow * as full", () => {
    expect(parseClause("allow * path=/").mode).toBe("full");
    expect(parseClause("allow * path=/").scope).toBe("cluster");
  });

  it("treats /volumes alone as every volume on the cluster", () => {
    const a = parseClause("allow rw fsname=X path=/volumes");
    expect(a.scope).toBe("all-volumes");
    expect(isBroadGrant(a)).toBe(true);
  });

  it("tolerates extra whitespace between clauses", () => {
    expect(splitClauses("allow rw path=/a ,  allow r path=/b")).toHaveLength(2);
  });

  it("strips the client. prefix", () => {
    expect(loginFromEntity("client.alice_0001")).toBe("alice_0001");
    expect(loginFromEntity("alice_0001")).toBe("alice_0001");
  });
});


describe("reading an exported keyring", () => {
  // Verbatim from /cluster/user/export on west, secret redacted. Listing cephx
  // entities is operator-only; exporting your own keyring is not, so this is
  // how the user-facing page learns what it can reach.
  const KEYRING = `[client.pruth_0031379841]
\tkey = REDACTEDREDACTEDREDACTED==
\tcaps mds = "allow rw fsname=CEPH-FS-01 path=/volumes/c93fe500-bdc7-48d7-89c7-a3103becf5f3/nrig/d112dee5-13a6-42ac-9f17-c7d80d786ad8, allow rw fsname=CEPH-FS-01 path=/volumes/fabric_users/pruth_0031379841/5ed87d57-060b-4225-944b-5d4e660d77fb"
\tcaps mon = "allow r fsname=CEPH-FS-01"
\tcaps osd = "allow rw tag cephfs data=CEPH-FS-01, allow rw tag cephfs metadata=CEPH-FS-01"

`;

  it("recovers the entity and every capability line", () => {
    const e = parseKeyring(KEYRING)!;
    expect(e.user_entity).toBe("client.pruth_0031379841");
    expect(e.capabilities?.map((c) => c.entity).sort()).toEqual(["mds", "mon", "osd"]);
  });

  it("yields both reachable volumes, with their real paths", () => {
    const access = effectiveAccess(parseKeyring(KEYRING)!);
    expect(access.map((a) => a.volume).sort()).toEqual(["nrig", "pruth_0031379841"]);
    // The path is what a mount command has to use. Mounting / is refused:
    // verified on the DTN as `mount error 13 = Permission denied`.
    expect(access.find((a) => a.volume === "nrig")?.path).toBe(
      "/volumes/c93fe500-bdc7-48d7-89c7-a3103becf5f3/nrig/d112dee5-13a6-42ac-9f17-c7d80d786ad8"
    );
  });

  it("does not mistake an osd tag cap for a path grant", () => {
    const access = effectiveAccess(parseKeyring(KEYRING)!);
    expect(access.every((a) => a.path.startsWith("/volumes/"))).toBe(true);
  });

  it("extracts the key, and returns null for text that is not a keyring", () => {
    expect(keyFromKeyring(KEYRING)).toBe("REDACTEDREDACTEDREDACTED==");
    expect(parseKeyring("not a keyring")).toBeNull();
  });
});
