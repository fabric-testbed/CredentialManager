/**
 * Principals, and what storage each one has.
 *
 * The old page was organised by resource - a list of subvolumes, a list of
 * cephx users, a list of buckets - with the owner as a dropdown inside each.
 * That is how "Entire Project" came to mean "every storage user": the owner was
 * a hint next to a button, never a resolved list of people.
 *
 * Here the principal comes first, and every action is expressed against a list
 * this module resolved and the operator saw.
 */

import { CephEntity, effectiveAccess, EffectiveAccess, loginFromEntity } from "./ceph-caps";

export const USER_GROUP = "fabric_users";

/**
 * CephFS's namespace for subvolumes created with no group.
 *
 * Real and in use: on asia, `kthare10_0011904101` lives at
 * `/volumes/_nogroup/kthare10_0011904101/<uuid>`, while every other personal
 * volume is under `fabric_users`. Coercing a missing group to `fabric_users`
 * would file it under the right person by luck and then look for its
 * capabilities under the wrong path prefix, so the access list would come back
 * empty for a volume that is very much granted.
 */
export const NO_GROUP = "_nogroup";

export type PrincipalKind = "user" | "project";

export interface UserPrincipal {
  kind: "user";
  uuid: string;
  name: string;
  email?: string;
  /** FABRIC bastion login. Also the CephFS subvolume name and the S3 uid. */
  login: string;
}

export interface ProjectPrincipal {
  kind: "project";
  uuid: string;
  name: string;
}

export type Principal = UserPrincipal | ProjectPrincipal;

/** A member of the storage service project: everyone who has storage at all. */
export interface StorageUser {
  uuid: string;
  bastion_login: string;
  name?: string;
  email?: string;
}

/** A FABRIC project as the Core API's detail endpoint returns it. */
export interface ProjectDetail {
  uuid: string;
  name?: string;
  project_members?: Array<{ uuid?: string; name?: string; email?: string }>;
  project_owners?: Array<{ uuid?: string; name?: string; email?: string }>;
  project_creators?: Array<{ uuid?: string; name?: string; email?: string }>;
}

export interface GranteeResolution {
  /** Members who have a storage account, so an action can actually reach them. */
  granted: StorageUser[];
  /** Members with no storage account. Named, never silently dropped. */
  withoutStorage: Array<{ uuid: string; name?: string }>;
  /** Total distinct members of the project, storage or not. */
  memberCount: number;
  /**
   * False when the storage-user list was not known to be complete.
   *
   * Acting on a subset of unknown size is the same class of bug as acting on
   * everyone, so callers must refuse rather than proceed.
   */
  complete: boolean;
}

/** Every distinct member uuid of a project, across all three membership roles. */
export function projectMemberUuids(project: ProjectDetail): Map<string, { name?: string }> {
  const out = new Map<string, { name?: string }>();
  for (const list of [
    project.project_members,
    project.project_owners,
    project.project_creators,
  ]) {
    for (const m of list ?? []) {
      if (m?.uuid) out.set(m.uuid, { name: m.name });
    }
  }
  return out;
}

/**
 * Who an action on a project would actually touch.
 *
 * `storageUsers` is the storage service project's membership - everyone who has
 * storage anywhere - and is NOT the project's membership. Using it directly is
 * what granted an NRIG volume to 276 accounts on 2026-09-23. The intersection
 * is the answer, and the parts that fall out of it are reported rather than
 * discarded.
 */
export function resolveProjectGrantees(
  project: ProjectDetail,
  storageUsers: StorageUser[],
  storageUsersComplete: boolean
): GranteeResolution {
  const members = projectMemberUuids(project);
  const byUuid = new Map(storageUsers.map((u) => [u.uuid, u]));

  const granted: StorageUser[] = [];
  const withoutStorage: Array<{ uuid: string; name?: string }> = [];

  for (const [uuid, info] of members) {
    const user = byUuid.get(uuid);
    if (user && user.bastion_login) granted.push(user);
    else withoutStorage.push({ uuid, name: info.name });
  }

  return {
    granted,
    withoutStorage,
    memberCount: members.size,
    complete: storageUsersComplete,
  };
}

/** Everything one principal has on one cluster. */
export interface PrincipalStorage {
  volumes: VolumeRow[];
  buckets: BucketRow[];
  access: AccessRow[];
  /** Cephx entity for this principal, when one exists. */
  entity?: CephEntity;
}

export interface VolumeRow {
  name: string;
  group: string;
  path?: string;
  bytesQuota?: number;
  bytesUsed?: number;
  /** True when the volume belongs to a project rather than a person. */
  shared: boolean;
  /** True for a subvolume with no group, living under /volumes/_nogroup. */
  ungrouped?: boolean;
}

export interface BucketRow {
  name: string;
  owner: string;
  sizeBytes?: number;
  quotaBytes?: number;
  numObjects?: number;
  /** Whose bucket it is, when shown under a project. */
  viaMember?: string;
}

export interface AccessRow {
  /** The cephx entity holding the grant. */
  entity: string;
  login: string;
  /** Display name of the person, when known. */
  person?: string;
  grant: EffectiveAccess;
}

export interface SubvolumeLike {
  name: string;
  group_name?: string;
  path?: string;
  bytes_quota?: number | string;
  bytes_used?: number | string;
}

function num(v: number | string | undefined): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * The volumes a principal owns.
 *
 * A person owns the subvolume named after their login in `fabric_users`. A
 * project owns every subvolume in the group named after its uuid - which is why
 * a project's volume list is a group listing and a person's is a name match.
 */
export function volumesFor(
  principal: Principal,
  subvolumes: SubvolumeLike[]
): VolumeRow[] {
  const rows: VolumeRow[] = [];
  for (const s of subvolumes) {
    // Faithful, never coerced. A missing group means _nogroup, which is a
    // different path prefix, not a synonym for the user group.
    const group = s.group_name || NO_GROUP;
    const isMine =
      principal.kind === "user"
        ? (group === USER_GROUP || group === NO_GROUP) && s.name === principal.login
        : group === principal.uuid;
    if (!isMine) continue;
    rows.push({
      name: s.name,
      group,
      path: s.path,
      bytesQuota: num(s.bytes_quota),
      bytesUsed: num(s.bytes_used),
      shared: principal.kind === "project",
      ungrouped: group === NO_GROUP,
    });
  }
  return rows;
}

/**
 * Who can reach a principal's storage, as effective access.
 *
 * For a project this is the question that matters and the one the old UI could
 * not answer: not "what caps does this person have" but "who can read this
 * volume". It is derived by scanning every entity for a grant whose path falls
 * inside the principal's group.
 */
export function accessTo(
  principal: Principal,
  entities: CephEntity[],
  people: Map<string, StorageUser>
): AccessRow[] {
  // A person's volumes can sit in either the user group or _nogroup, so both
  // path prefixes have to be searched or a granted volume reads as unreachable.
  const groups =
    principal.kind === "user" ? [USER_GROUP, NO_GROUP] : [principal.uuid];
  const rows: AccessRow[] = [];
  for (const e of entities) {
    const login = loginFromEntity(e.user_entity);
    for (const grant of effectiveAccess(e)) {
      if (!grant.group || !groups.includes(grant.group)) continue;
      // A personal group is shared by every user, so only the owner's own
      // volume counts as access to THIS principal's storage.
      if (principal.kind === "user" && grant.scope === "volume" && grant.volume !== principal.login) {
        continue;
      }
      rows.push({
        entity: e.user_entity,
        login,
        person: people.get(login)?.name,
        grant,
      });
    }
  }
  return rows;
}

/**
 * A bucket as `/s3/bucket` returns it.
 *
 * Usage is `size_kb`, and it is ABSENT on an empty bucket rather than zero -
 * so undefined means "nothing written yet", not "unknown". The quota lives
 * under `quota.max_size_kb`. Reading a `size` field that the endpoint does not
 * send renders every bucket as having no size at all, which is what the column
 * did before this shape was checked against a live response.
 */
export interface BucketLike {
  bucket?: string;
  name?: string;
  owner?: string;
  size_kb?: number;
  num_objects?: number;
  quota?: { enabled?: boolean; max_size_kb?: number };
}

const KB = 1024;

/**
 * The buckets a principal owns.
 *
 * A PROJECT owns none. RGW has no notion of a project, so every bucket belongs
 * to an individual, and treating a project's buckets as "its members' buckets"
 * is a conflation with a visible cost: a person in ten projects has their
 * personal bucket listed under all ten, as if each project had a claim on it.
 * So a project returns nothing here, and the caller offers its members' buckets
 * separately and says whose they are.
 */
export function bucketsFor(
  principal: Principal,
  buckets: BucketLike[]
): BucketRow[] {
  if (principal.kind !== "user") return [];
  const mine = new Set([principal.login]);
  const rows: BucketRow[] = [];
  for (const b of buckets) {
    const name = b.bucket || b.name;
    const owner = b.owner || "";
    if (!name || !mine.has(owner)) continue;
    rows.push({
      name,
      owner,
      // An empty bucket sends no size_kb at all; report 0, not unknown.
      sizeBytes: (b.size_kb ?? 0) * KB,
      quotaBytes:
        b.quota?.max_size_kb !== undefined ? b.quota.max_size_kb * KB : undefined,
      numObjects: b.num_objects ?? 0,
    });
  }
  return rows;
}

/**
 * Buckets owned by a project's members, attributed to the person who owns them.
 *
 * Deliberately separate from `bucketsFor`: these are not the project's storage,
 * and the UI must not present them as though they were. Shown on request, each
 * row naming its owner.
 */
export function memberBuckets(
  buckets: BucketLike[],
  memberLogins: string[]
): BucketRow[] {
  const members = new Set(memberLogins);
  const rows: BucketRow[] = [];
  for (const b of buckets) {
    const name = b.bucket || b.name;
    const owner = b.owner || "";
    if (!name || !members.has(owner)) continue;
    rows.push({
      name,
      owner,
      sizeBytes: (b.size_kb ?? 0) * KB,
      quotaBytes:
        b.quota?.max_size_kb !== undefined ? b.quota.max_size_kb * KB : undefined,
      numObjects: b.num_objects ?? 0,
      viaMember: owner,
    });
  }
  return rows;
}
