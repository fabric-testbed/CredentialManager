"use client";

/**
 * Storage administration, organised principal -> storage -> access.
 *
 * Phase 1 of docs/design-storage-admin-globus.md in the fabric_ceph repo. The
 * existing /storage page is organised by resource type - a list of subvolumes,
 * a list of cephx users, a list of buckets - with the owner as a dropdown
 * inside each. That shape is what let an "Entire Project" capability apply
 * reach 276 accounts for a five-person project on 2026-09-23: the owner was a
 * hint beside a button, not a list anybody had resolved.
 *
 * Here you choose the principal first, see everything they have across CephFS
 * and S3, see who can actually reach it as sentences rather than cap strings,
 * and every multi-person action shows the resolved list with a count before it
 * runs.
 *
 * Deliberately not here: Globus exposure. That is phase 2.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Globe, HardDrive, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { ApplyPreviewDialog } from "@/components/storage/apply-preview-dialog";
import {
  DTN_CLIENT,
  ExposeDialog,
  ExposureStatus,
} from "@/components/storage/globus-exposure";
import { exposuresForVolume, liveExposure } from "@/lib/globus-exposure";
import {
  CreateBucketDialog,
  CreateVolumeDialog,
  DeleteVolumeDialog,
  ResizeVolumeDialog,
  groupFor,
} from "@/components/storage/storage-actions";
import { EffectiveAccess } from "@/components/storage/effective-access";
import { PrincipalPicker, ProjectOption } from "@/components/storage/principal-picker";
import { errorMessage, useStorageSession } from "@/hooks/use-storage-session";
import { useUserStatus } from "@/hooks/use-user-status";
import { CephEntity } from "@/lib/ceph-caps";
import {
  accessTo,
  bucketsFor,
  memberBuckets,
  VolumeRow,
  GranteeResolution,
  Principal,
  ProjectDetail,
  resolveProjectGrantees,
  StorageUser,
  volumesFor,
} from "@/lib/principals";
import { fetchStorageUsers } from "@/lib/storage-users";
import {
  createGlobusExposure,
  deleteGlobusExposure,
  GlobusEndpoint,
  listGlobusEndpoints,
  listGlobusExposures,
  VolumeExposure,
} from "@/services/globus-service";
import { getAllProjectsPaginated, getProject } from "@/services/core-api-service";
import {
  applyUserCaps,
  createOrResizeSubvolume,
  createS3Bucket,
  deleteS3Bucket,
  deleteSubvolume,
  exportUserKeyrings,
  listCephUsers,
  listProjectMembers,
  listS3Buckets,
  listSubvolumeGroups,
  listSubvolumes,
} from "@/services/storage-service";

/** The CephFS volume name. Not returned by /cluster/info; constant everywhere. */
const FS_NAME = "CEPH-FS-01";

/** Same template the existing storage page applies, so grants are identical. */
const CAPS_TEMPLATE = [
  { entity: "mon", cap: "allow r fsname={fs}" },
  { entity: "mds", cap: "allow rw fsname={fs} path={path}" },
  { entity: "osd", cap: "allow rw tag cephfs data={fs}" },
  { entity: "osd", cap: "allow rw tag cephfs metadata={fs}" },
];

/**
 * Bytes as a quota: 0 means no limit, which is Ceph's convention.
 *
 * Never use this for usage. An empty bucket has 0 bytes used, and rendering
 * that as "unlimited" is not merely odd, it is the opposite of true - which is
 * exactly what the Used column showed for an empty bucket.
 */
function formatQuota(bytes?: number): string {
  if (bytes === undefined) return "—";
  if (bytes === 0) return "unlimited";
  return formatSize(bytes);
}

/** Bytes as an amount consumed. 0 is empty, and says so. */
function formatUsage(bytes?: number): string {
  if (bytes === undefined) return "—";
  if (bytes === 0) return "empty";
  return formatSize(bytes);
}

function formatSize(bytes: number): string {
  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function StorageAdminPage() {
  const { cmUserStatus } = useUserStatus();
  const active = cmUserStatus === "active";
  const { isOperator, roleLoaded, clusters, cluster, setCluster, ensureToken } =
    useStorageSession(active);

  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [people, setPeople] = useState<StorageUser[]>([]);
  const [peopleComplete, setPeopleComplete] = useState(false);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [entities, setEntities] = useState<CephEntity[]>([]);
  const [subvolumes, setSubvolumes] = useState<
    Array<{ name: string; group_name?: string; path?: string; bytes_quota?: number | string }>
  >([]);
  const [buckets, setBuckets] = useState<
    Array<{ bucket?: string; owner?: string; size?: number; num_objects?: number }>
  >([]);
  const [loading, setLoading] = useState(false);

  const [endpoints, setEndpoints] = useState<GlobusEndpoint[]>([]);
  const [exposures, setExposures] = useState<VolumeExposure[]>([]);
  const [exposeVol, setExposeVol] = useState<VolumeRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [resizeVol, setResizeVol] = useState<VolumeRow | null>(null);
  const [deleteVol, setDeleteVol] = useState<VolumeRow | null>(null);
  const [bucketOpen, setBucketOpen] = useState(false);
  const [acting, setActing] = useState(false);
  const [grantOpen, setGrantOpen] = useState(false);
  const [grantVolume, setGrantVolume] = useState<{ name: string; group: string } | null>(null);
  const [resolution, setResolution] = useState<GranteeResolution | null>(null);
  const [applying, setApplying] = useState(false);

  const projectNames = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.uuid, p.name])),
    [projects]
  );
  const peopleByLogin = useMemo(
    () => new Map(people.map((p) => [p.bastion_login, p])),
    [people]
  );

  // ---- loading ------------------------------------------------------------
  const loadPrincipals = useCallback(async () => {
    try {
      const token = await ensureToken();
      // /project/members answers for the Ceph SERVICE project: everyone who has
      // storage. That is the right list for "which people can I pick", and the
      // wrong list for "who is in this project" - the distinction that caused
      // the 2026-09-23 over-grant. It is never used as project membership here.
      //
      // Paged through fetchStorageUsers rather than asked for in one big page:
      // rows are dropped mid-page, so a short page is not the last page, and a
      // single request would report a truncated list as complete.
      const fetched = await fetchStorageUsers((offset, limit) =>
        listProjectMembers(token, offset, limit).then((r) => r.data)
      );
      setPeople(fetched.users);
      setPeopleComplete(fetched.complete);
      if (!fetched.complete && fetched.reason) toast.warning(fetched.reason);

      const all = (await getAllProjectsPaginated()) as Array<{ uuid: string; name: string }>;
      setProjects(all.map((p) => ({ uuid: p.uuid, name: p.name })));
    } catch (ex) {
      toast.error(errorMessage(ex, "Failed to load people and projects."));
    }
  }, [ensureToken]);

  const loadCluster = useCallback(async () => {
    if (!cluster) return;
    setLoading(true);
    try {
      const token = await ensureToken();
      const fs = FS_NAME;

      // Listing subvolumes without a group returns ONLY the ungrouped ones -
      // on asia that is a single row out of dozens. The full picture is the
      // no-group listing plus one request per group, merged.
      const { data: groupResp } = await listSubvolumeGroups(token, cluster, fs);
      const groupNames: string[] = groupResp?.data ?? [];

      const [users, bks, ...subLists] = await Promise.all([
        listCephUsers(token, cluster),
        listS3Buckets(token, cluster).catch(() => ({ data: { data: [] } })),
        listSubvolumes(token, cluster, fs, undefined, true),
        ...groupNames.map((g) => listSubvolumes(token, cluster, fs, g, true)),
      ]);

      const merged = subLists.flatMap((r) => r.data?.data ?? []);
      setSubvolumes(merged);

      // Globus state. Tolerated separately: a deployment without the state
      // store answers 500 here, and that must not blank out the volumes and
      // buckets, which have nothing to do with Globus.
      try {
        const [eps, exps] = await Promise.all([
          listGlobusEndpoints(token),
          listGlobusExposures(token, { cluster }),
        ]);
        setEndpoints(eps.data?.endpoints ?? []);
        setExposures(exps.data?.exposures ?? []);
      } catch {
        setEndpoints([]);
        setExposures([]);
      }
      setEntities(users.data?.data ?? []);
      setBuckets(bks.data?.data ?? []);
    } catch (ex) {
      toast.error(errorMessage(ex, "Failed to load storage for this cluster."));
    } finally {
      setLoading(false);
    }
  }, [cluster, ensureToken]);

  useEffect(() => {
    if (active && roleLoaded && isOperator) loadPrincipals();
  }, [active, roleLoaded, isOperator, loadPrincipals]);

  useEffect(() => {
    if (active && roleLoaded && isOperator) loadCluster();
  }, [active, roleLoaded, isOperator, loadCluster]);

  // ---- derived ------------------------------------------------------------
  const volumes = useMemo(
    () => (principal ? volumesFor(principal, subvolumes) : []),
    [principal, subvolumes]
  );
  const access = useMemo(
    () => (principal ? accessTo(principal, entities, peopleByLogin) : []),
    [principal, entities, peopleByLogin]
  );
  const [memberLogins, setMemberLogins] = useState<string[]>([]);
  const bucketRows = useMemo(
    () => (principal ? bucketsFor(principal, buckets) : []),
    [principal, buckets]
  );
  // A project's members' own buckets. Not the project's storage - shown only
  // when asked for, and always attributed.
  const [showMemberBuckets, setShowMemberBuckets] = useState(false);
  const memberBucketRows = useMemo(
    () =>
      principal?.kind === "project" && showMemberBuckets
        ? memberBuckets(buckets, memberLogins)
        : [],
    [principal, buckets, memberLogins, showMemberBuckets]
  );

  // A project's membership comes from the Core API, resolved against the
  // storage-user list. Loaded when the principal changes so the counts shown
  // beside the project are the ones any action would use.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (principal?.kind !== "project") {
        setResolution(null);
        setMemberLogins([]);
        return;
      }
      try {
        const { data } = await getProject(principal.uuid);
        const detail = (data.results || [])[0] as ProjectDetail | undefined;
        if (cancelled || !detail) return;
        const r = resolveProjectGrantees(detail, people, peopleComplete);
        setResolution(r);
        setMemberLogins(r.granted.map((g) => g.bastion_login));
      } catch (ex) {
        if (!cancelled) toast.error(errorMessage(ex, "Failed to load project membership."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [principal, people, peopleComplete]);

  // ---- actions ------------------------------------------------------------
  const applyGrant = useCallback(async () => {
    if (!grantVolume || !resolution || !cluster) return;
    setApplying(true);
    try {
      const token = await ensureToken();
      const fs = FS_NAME;
      const logins = resolution.granted.map((g) => g.bastion_login);

      // One request per person - the endpoint takes a single user_entity - so
      // this can partially fail. Each outcome is recorded and reported; a
      // blanket success toast over a partial apply is the same failure as the
      // over-grant, in the other direction.
      const failed: Array<{ login: string; why: string }> = [];
      for (const login of logins) {
        try {
          await applyUserCaps(token, cluster, {
            user_entity: `client.${login}`,
            template_capabilities: CAPS_TEMPLATE,
            renders: [
              { fs_name: fs, subvol_name: grantVolume.name, group_name: grantVolume.group },
            ],
            sync_across_clusters: true,
            merge_strategy: "multi",
          });
        } catch (ex) {
          failed.push({ login, why: errorMessage(ex, "unknown error") });
        }
      }

      const ok = logins.length - failed.length;
      if (failed.length === 0) {
        toast.success(
          `Granted read-write on ${grantVolume.name} to ${ok} ${
            ok === 1 ? "person" : "people"
          }.`
        );
        setGrantOpen(false);
      } else {
        toast.error(
          `Granted to ${ok} of ${logins.length}. Failed: ${failed
            .map((f) => f.login)
            .join(", ")}. The dialog stays open so you can retry.`
        );
      }
      await loadCluster();
    } catch (ex) {
      toast.error(errorMessage(ex, "Failed to apply capabilities."));
    } finally {
      setApplying(false);
    }
  }, [grantVolume, resolution, cluster, ensureToken, loadCluster]);

  const runAction = useCallback(
    async (what: string, fn: (token: string) => Promise<unknown>, done?: () => void) => {
      setActing(true);
      try {
        const token = await ensureToken();
        await fn(token);
        toast.success(what);
        done?.();
        await loadCluster();
      } catch (ex) {
        toast.error(errorMessage(ex, `Failed: ${what}`));
      } finally {
        setActing(false);
      }
    },
    [ensureToken, loadCluster]
  );

  /**
   * Download a person's cephx keyring.
   *
   * Only for a person: a project has no cephx entity of its own. Access to a
   * project's volumes is granted to each member's own key, which is why the
   * access list above is a list of people rather than one shared credential.
   */
  const exportKeyring = useCallback(async () => {
    if (principal?.kind !== "user") return;
    const entity = `client.${principal.login}`;
    try {
      const token = await ensureToken();
      const { data } = await exportUserKeyrings(token, cluster, [entity]);
      // { clusters: { <cluster>: { <entity>: "<keyring text>" } } } - NOT the
      // `data` envelope the other endpoints use. Reading `data.data` here meant
      // the export always reported "no keyring", for a call that had succeeded.
      const byCluster = (data?.clusters ?? {}) as Record<string, Record<string, string>>;
      const text = byCluster[cluster]?.[entity];
      if (!text) {
        toast.error(`No keyring for ${entity} on ${cluster}.`);
        return;
      }
      const blob = new Blob([text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ceph.${entity}.keyring`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (ex) {
      toast.error(errorMessage(ex, "Failed to export the keyring."));
    }
  }, [principal, cluster, ensureToken]);

  const expose = useCallback(
    async (volume: VolumeRow, site: string) => {
      if (!principal) return;
      await runAction(
        `Requested ${volume.name} at ${site}`,
        (t) =>
          createGlobusExposure(t, {
            cluster,
            group_name: volume.group,
            subvol_name: volume.name,
            site,
            // Only meaningful for a person; a project volume's owner is its
            // subvolume group and the service resolves it itself.
            ...(principal.kind === "user" ? { owner_uuid: principal.uuid } : {}),
          }),
        () => setExposeVol(null)
      );
    },
    [principal, cluster, runAction]
  );

  /**
   * Give the DTN's cephx key a path on this one volume.
   *
   * Deliberately a separate, explicit act rather than something
   * `POST /globus/exposures` does for you. The DTN gaining read-write on a
   * project's data is exactly the kind of change that should be a decision
   * somebody made, not a side effect of a UI click - and it shows up
   * immediately in "Who can reach this storage", where it reads as a service
   * key holding a grant.
   *
   * Scoped to the volume, not the group: the mount uses the subvolume's full
   * path, so a path grant on that one subvolume is enough. Granting the whole
   * group would also cover volumes created later, which nobody has asked for.
   */
  const grantDtn = useCallback(
    (e: VolumeExposure) =>
      runAction(
        `Granted ${DTN_CLIENT} access to ${e.subvol_name}`,
        (t) =>
          applyUserCaps(t, e.cluster, {
            user_entity: `client.${DTN_CLIENT}`,
            template_capabilities: CAPS_TEMPLATE,
            renders: [
              {
                fs_name: FS_NAME,
                subvol_name: e.subvol_name,
                group_name: e.group_name,
              },
            ],
            sync_across_clusters: false,
            merge_strategy: "multi",
          })
      ),
    [runAction]
  );

  const withdraw = useCallback(
    (e: VolumeExposure) =>
      runAction(`Withdrawing ${e.subvol_name} from ${e.site}`, (t) =>
        deleteGlobusExposure(t, e.cluster, e.group_name, e.subvol_name, e.site)
      ),
    [runAction]
  );

  // ---- render -------------------------------------------------------------
  if (!roleLoaded) return <div className="p-6 text-sm">Loading…</div>;

  if (!isOperator) {
    return (
      <div className="p-6">
        <Alert>
          <AlertDescription>
            Storage administration is limited to facility administrators and
            owners of the storage service project. Your own storage is on the{" "}
            <a className="underline" href="/storage">
              Storage
            </a>{" "}
            page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-fabric-dark">Storage administration</h1>
        <div className="flex items-center gap-2">
          <Select value={cluster} onValueChange={setCluster}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Cluster" />
            </SelectTrigger>
            <SelectContent>
              {clusters.map((c) => (
                <SelectItem key={c.cluster} value={c.cluster}>
                  {c.cluster}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={loadCluster} disabled={loading}>
            <RefreshCw className={`mr-1 h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {!peopleComplete && (
        <Alert variant="destructive">
          <AlertDescription>
            The storage user list did not report as complete. Project actions are
            disabled until it does — resolving a project against a partial list
            would apply to a subset of unknown size.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">1. Choose a principal</CardTitle>
          </CardHeader>
          <CardContent>
            <PrincipalPicker
              people={people}
              projects={projects}
              selected={principal}
              onSelect={setPrincipal}
              loading={people.length === 0}
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          {!principal ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                Choose a person or a project to see what storage they have and
                who can reach it.
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-sm">
                    {principal.name}{" "}
                    <Badge variant="secondary" className="ml-1">
                      {principal.kind === "user" ? "person" : "project"}
                    </Badge>
                  </CardTitle>
                  {principal.kind === "project" && resolution && (
                    <span className="text-xs text-muted-foreground">
                      {resolution.granted.length} of {resolution.memberCount} members
                      have storage
                    </span>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  <section>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="flex items-center gap-1 text-sm font-medium">
                        <HardDrive className="h-3 w-3" /> CephFS volumes
                      </h3>
                      <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
                        <Plus className="mr-1 h-3 w-3" /> Create volume
                      </Button>
                    </div>
                    {volumes.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No volume on {cluster}.
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Volume</TableHead>
                            <TableHead>Quota</TableHead>
                            <TableHead>Globus</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {volumes.map((v) => (
                            <TableRow key={`${v.group}/${v.name}`}>
                              <TableCell className="font-medium">
                                {v.name}
                                {v.ungrouped && (
                                  <Badge variant="outline" className="ml-2">
                                    no group
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>{formatQuota(v.bytesQuota)}</TableCell>
                              <TableCell>
                                <ExposureStatus
                                  exposures={exposuresForVolume(
                                    exposures, cluster, v.group, v.name
                                  )}
                                  onGrantDtn={grantDtn}
                                  busy={acting}
                                />
                              </TableCell>
                              <TableCell className="space-x-1 text-right">
                                {principal.kind === "project" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={!resolution || !peopleComplete}
                                    onClick={() => {
                                      setGrantVolume({ name: v.name, group: v.group });
                                      setGrantOpen(true);
                                    }}
                                  >
                                    <ShieldCheck className="mr-1 h-3 w-3" />
                                    Grant to members…
                                  </Button>
                                )}
                                {(() => {
                                  const mine = exposuresForVolume(
                                    exposures, cluster, v.group, v.name
                                  );
                                  const live = liveExposure(mine);
                                  return live ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={acting}
                                      onClick={() => withdraw(live)}
                                    >
                                      Withdraw
                                    </Button>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={acting || endpoints.length === 0}
                                      title={
                                        endpoints.length === 0
                                          ? "No Globus endpoint is registered"
                                          : undefined
                                      }
                                      onClick={() => setExposeVol(v)}
                                    >
                                      <Globe className="mr-1 h-3 w-3" />
                                      Publish…
                                    </Button>
                                  );
                                })()}
                                <Button size="sm" variant="outline" onClick={() => setResizeVol(v)}>
                                  Resize
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-destructive"
                                  onClick={() => setDeleteVol(v)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </section>

                  <section>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-medium">S3 buckets</h3>
                      <Button size="sm" variant="outline" onClick={() => setBucketOpen(true)}>
                        <Plus className="mr-1 h-3 w-3" /> Create bucket
                      </Button>
                    </div>
                    {principal.kind === "project" ? (
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">
                          A project owns no buckets. RGW has no notion of a
                          project, so every bucket belongs to a person — listing
                          members&apos; buckets here would show someone&apos;s
                          personal bucket under every project they belong to.
                        </p>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setShowMemberBuckets((v) => !v)}
                        >
                          {showMemberBuckets ? "Hide" : "Show"} buckets owned by
                          members ({memberLogins.length} member
                          {memberLogins.length === 1 ? "" : "s"})
                        </Button>
                        {showMemberBuckets && (
                          memberBucketRows.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              No member of this project owns a bucket on {cluster}.
                            </p>
                          ) : (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Bucket</TableHead>
                                  <TableHead>Owned by</TableHead>
                                  <TableHead>Objects</TableHead>
                                  <TableHead>Used / quota</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {memberBucketRows.map((b) => (
                                  <TableRow key={b.name}>
                                    <TableCell className="font-medium">{b.name}</TableCell>
                                    <TableCell className="text-muted-foreground">
                                      {b.viaMember}
                                    </TableCell>
                                    <TableCell>{b.numObjects ?? 0}</TableCell>
                                    <TableCell>
                                      {formatUsage(b.sizeBytes)}
                                      {b.quotaBytes !== undefined && (
                                        <span className="text-muted-foreground">
                                          {" / "}
                                          {formatQuota(b.quotaBytes)}
                                        </span>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          )
                        )}
                      </div>
                    ) : bucketRows.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No bucket on {cluster}.
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Bucket</TableHead>
                            <TableHead>Owner</TableHead>
                            <TableHead>Objects</TableHead>
                            <TableHead>Used / quota</TableHead>
                            <TableHead />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {bucketRows.map((b) => (
                            <TableRow key={b.name}>
                              <TableCell className="font-medium">{b.name}</TableCell>
                              <TableCell className="text-muted-foreground">{b.owner}</TableCell>
                              <TableCell>{b.numObjects ?? 0}</TableCell>
                              <TableCell>
                                {formatUsage(b.sizeBytes)}
                                {b.quotaBytes !== undefined && (
                                  <span className="text-muted-foreground">
                                    {" / "}
                                    {formatQuota(b.quotaBytes)}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-destructive"
                                  disabled={acting}
                                  onClick={() =>
                                    runAction(`Deleted bucket ${b.name}`, (t) =>
                                      deleteS3Bucket(t, cluster, b.name, false)
                                    )
                                  }
                                  title="Delete. Refuses if the bucket still has objects."
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </section>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-sm">Who can reach this storage</CardTitle>
                  {principal.kind === "user" && (
                    <Button size="sm" variant="outline" onClick={exportKeyring}>
                      <Download className="mr-1 h-3 w-3" /> Export keyring
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  <EffectiveAccess
                    rows={access}
                    projectNames={projectNames}
                    emptyMessage={
                      // "Nobody can reach it" and "there is nothing to reach"
                      // are different findings, and only the first is a
                      // problem. On east, NRIG has no volume at all.
                      volumes.length === 0
                        ? `No volume here to grant access to. ${
                            principal.kind === "project"
                              ? "This project has none on"
                              : "This person has none on"
                          } ${cluster}.`
                        : principal.kind === "project"
                        ? "This project has volumes, but no cephx key grants access to them - members cannot mount them in a slice."
                        : "This volume exists, but no cephx key grants access to it."
                    }
                  />
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      {principal && (
        <>
          <CreateVolumeDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            principal={principal}
            cluster={cluster}
            existing={volumes}
            busy={acting}
            onCreate={(name, group, size) =>
              runAction(`Created ${name}`, (t) =>
                createOrResizeSubvolume(t, cluster, FS_NAME, {
                  subvol_name: name,
                  group_name: group,
                  size,
                }),
                () => setCreateOpen(false)
              )
            }
          />
          <ResizeVolumeDialog
            open={resizeVol !== null}
            onOpenChange={(v) => !v && setResizeVol(null)}
            volume={resizeVol}
            busy={acting}
            onResize={(size) =>
              runAction(`Resized ${resizeVol?.name}`, (t) =>
                createOrResizeSubvolume(t, cluster, FS_NAME, {
                  subvol_name: resizeVol!.name,
                  group_name: groupFor(principal),
                  size,
                }),
                () => setResizeVol(null)
              )
            }
          />
          <DeleteVolumeDialog
            open={deleteVol !== null}
            onOpenChange={(v) => !v && setDeleteVol(null)}
            volume={deleteVol}
            holders={access
              .filter((a) => a.grant.volume === deleteVol?.name)
              .map((a) => a.person || a.login)}
            busy={acting}
            onDelete={() =>
              runAction(`Deleted ${deleteVol?.name}`, (t) =>
                deleteSubvolume(t, cluster, FS_NAME, deleteVol!.name, groupFor(principal), false),
                () => setDeleteVol(null)
              )
            }
          />
          <ExposeDialog
            open={exposeVol !== null}
            onOpenChange={(v) => !v && setExposeVol(null)}
            volumeName={exposeVol?.name ?? ""}
            endpoints={endpoints.filter(
              (e) =>
                !exposures.some(
                  (x) =>
                    x.site === e.site &&
                    x.subvol_name === exposeVol?.name &&
                    x.group_name === exposeVol?.group &&
                    x.state !== "removing"
                )
            )}
            reachableBy={
              principal.kind === "project"
                ? (resolution?.granted ?? []).map((g) => g.name || g.bastion_login)
                : [principal.name]
            }
            unresolved={
              principal.kind === "project"
                ? (resolution?.withoutStorage ?? []).map((m) => m.name || m.uuid)
                : []
            }
            busy={acting}
            onExpose={(site) => exposeVol && expose(exposeVol, site)}
          />
          <CreateBucketDialog
            open={bucketOpen}
            onOpenChange={setBucketOpen}
            principal={principal}
            cluster={cluster}
            owners={
              principal.kind === "user"
                ? [{ login: principal.login, name: principal.name }]
                : (resolution?.granted ?? []).map((g) => ({
                    login: g.bastion_login,
                    name: g.name,
                  }))
            }
            busy={acting}
            onCreate={(bucket, uid) =>
              runAction(`Created bucket ${bucket}`, (t) =>
                createS3Bucket(t, cluster, { bucket, uid }),
                () => setBucketOpen(false)
              )
            }
          />
        </>
      )}

      {resolution && grantVolume && (
        <ApplyPreviewDialog
          open={grantOpen}
          onOpenChange={setGrantOpen}
          title={`Grant access to ${grantVolume.name}`}
          action={`Read-write on ${grantVolume.name}, for the members of ${principal?.name}.`}
          resolution={resolution}
          busy={applying}
          onConfirm={applyGrant}
        />
      )}
    </div>
  );
}
