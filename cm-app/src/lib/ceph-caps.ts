/**
 * CephX capabilities, read as effective access.
 *
 * The storage page used to print the raw cap string, cut off at the column
 * edge:
 *
 *   mds: allow rw fsname=CEPH-FS-01 path=/volumes/c93fe500-bdc7-48d7-…
 *
 * Nobody can tell from that whether a person can reach one volume or every
 * volume in a project, which is the only question an operator is ever asking.
 * So the UI shows what the capability *means*, and this module is where the
 * meaning is worked out.
 *
 * The shapes below are the ones that actually occur on the clusters, taken from
 * a live listing of all 123 cephx entities on west rather than from the docs:
 *
 *   mds: allow rw fsname=CEPH-FS-01 path=/volumes/fabric_users/<login>/<uuid>
 *   mds: allow rw fsname=CEPH-FS-01 path=/volumes/<project-uuid>/<name>/<uuid>
 *   mds: <clause>, <clause>            (comma-separated, one per grant)
 *   mds: allow rw fsname=CEPH-FS-01 path=/volumes/fabric_users
 *   mon: allow *
 */

export interface Capability {
  entity: string;
  cap: string;
}

/** A cephx entity as the Ceph manager returns it. */
export interface CephEntity {
  user_entity: string;
  capabilities?: Capability[];
  metadata?: { has_key?: boolean };
}

export type AccessMode = "read-write" | "read-only" | "full" | "other";

/**
 * How wide a single grant reaches. This distinction is the point of the module:
 * `volume` is one subvolume, `group` is EVERY volume in that group - present and
 * future - and they look nearly identical as raw strings.
 */
export type AccessScope = "volume" | "group" | "all-volumes" | "cluster" | "other";

export interface EffectiveAccess {
  mode: AccessMode;
  scope: AccessScope;
  /** Full CephFS path the grant covers. */
  path: string;
  fsname?: string;
  /** `fabric_users` for a personal volume, otherwise the owning project's uuid. */
  group?: string;
  /** Subvolume name, when the grant is to a single volume. */
  volume?: string;
  /** The generated uuid CephFS appends to a subvolume path. */
  volumeId?: string;
  /** The clause this came from, kept so the raw form is still reachable. */
  raw: string;
}

function parseMode(clause: string): AccessMode {
  const m = /allow\s+([a-z*]+)/.exec(clause);
  const verb = m ? m[1] : "";
  if (verb === "*" || verb === "all") return "full";
  if (verb.includes("w")) return "read-write";
  if (verb.includes("r")) return "read-only";
  return "other";
}

function parseValue(clause: string, key: string): string | undefined {
  // Values run to the next comma or whitespace; paths never contain either.
  const m = new RegExp(`${key}=([^,\\s]+)`).exec(clause);
  return m ? m[1] : undefined;
}

/**
 * Split an mds cap into its grants.
 *
 * Comma-separated, and a cap with several clauses is how a person ends up with
 * both their own volume and a project's. Splitting on the comma is safe because
 * no field within a clause may contain one.
 */
export function splitClauses(cap: string): string[] {
  return cap
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

/** Read one mds clause as an effective grant. */
export function parseClause(clause: string): EffectiveAccess {
  const mode = parseMode(clause);
  const fsname = parseValue(clause, "fsname");
  const path = parseValue(clause, "path") ?? "/";

  const parts = path.split("/").filter(Boolean); // volumes/<group>/<name>/<uuid>
  let scope: AccessScope = "other";
  let group: string | undefined;
  let volume: string | undefined;
  let volumeId: string | undefined;

  if (parts[0] === "volumes") {
    if (parts.length >= 4) {
      scope = "volume";
      [, group, volume, volumeId] = parts;
    } else if (parts.length === 3) {
      // No trailing uuid. Still one named volume.
      scope = "volume";
      [, group, volume] = parts;
    } else if (parts.length === 2) {
      // EVERY volume in the group, including ones created later.
      scope = "group";
      group = parts[1];
    } else {
      scope = "all-volumes";
    }
  } else if (path === "/") {
    scope = "cluster";
  }

  return { mode, scope, path, fsname, group, volume, volumeId, raw: clause };
}

/**
 * Every filesystem grant an entity holds.
 *
 * Only `mds` caps carry a path. `mon` and `osd` caps are what let the client
 * talk to the cluster at all and grant no data access on their own, so they are
 * deliberately not surfaced as access.
 */
export function effectiveAccess(entity: CephEntity): EffectiveAccess[] {
  const caps = entity.capabilities ?? [];
  const out: EffectiveAccess[] = [];
  for (const c of caps) {
    if (c.entity !== "mds") continue;
    for (const clause of splitClauses(c.cap)) {
      if (!/allow/.test(clause)) continue;
      out.push(parseClause(clause));
    }
  }
  return out;
}

/** `client.alice_0001` -> `alice_0001`. */
export function loginFromEntity(entity: string): string {
  return entity.replace(/^client\./, "");
}

export interface AccessLabelOptions {
  /** uuid -> human project name, so a grant reads as a project, not a uuid. */
  projectNames?: Record<string, string>;
  /** The group holding personal volumes. */
  userGroup?: string;
}

/**
 * One line an operator can act on, e.g.
 *   "read-write on nrig (NRIG Research)"
 *   "read-write on EVERY volume in NRIG Research"
 */
export function describeAccess(
  access: EffectiveAccess,
  opts: AccessLabelOptions = {}
): string {
  const userGroup = opts.userGroup ?? "fabric_users";
  const names = opts.projectNames ?? {};
  const where =
    access.group === userGroup
      ? "personal volumes"
      : names[access.group ?? ""] ?? access.group ?? "the cluster";

  switch (access.scope) {
    case "volume":
      return access.group === userGroup
        ? `${access.mode} on ${access.volume} (personal volume)`
        : `${access.mode} on ${access.volume} (${where})`;
    case "group":
      // Deliberately shouty. This is the grant that looks like the one above
      // and is not: it covers volumes that do not exist yet.
      return `${access.mode} on EVERY volume in ${where}`;
    case "all-volumes":
      return `${access.mode} on EVERY volume on this cluster`;
    case "cluster":
      return `${access.mode} on the entire filesystem`;
    default:
      return `${access.mode} on ${access.path}`;
  }
}

/**
 * True when a grant reaches past a single named volume.
 *
 * The UI marks these, because a person holding one is a finding, while the same
 * grant on the Globus DTN's key is expected.
 */
export function isBroadGrant(access: EffectiveAccess): boolean {
  return access.scope !== "volume";
}
