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
import { HardDrive, RefreshCw, ShieldCheck } from "lucide-react";

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
import { EffectiveAccess } from "@/components/storage/effective-access";
import { PrincipalPicker, ProjectOption } from "@/components/storage/principal-picker";
import { errorMessage, useStorageSession } from "@/hooks/use-storage-session";
import { useUserStatus } from "@/hooks/use-user-status";
import { CephEntity } from "@/lib/ceph-caps";
import {
  accessTo,
  bucketsFor,
  GranteeResolution,
  Principal,
  ProjectDetail,
  resolveProjectGrantees,
  StorageUser,
  volumesFor,
} from "@/lib/principals";
import { fetchStorageUsers } from "@/lib/storage-users";
import { getAllProjectsPaginated, getProject } from "@/services/core-api-service";
import {
  applyUserCaps,
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

function formatBytes(bytes?: number): string {
  if (bytes === undefined) return "—";
  if (bytes === 0) return "unlimited";
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
      setEntities(users.data?.data ?? []);
      setBuckets(bks.data?.data ?? []);
    } catch (ex) {
      toast.error(errorMessage(ex, "Failed to load storage for this cluster."));
    } finally {
      setLoading(false);
    }
  }, [cluster, clusters, ensureToken]);

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
    () => (principal ? bucketsFor(principal, buckets, memberLogins) : []),
    [principal, buckets, memberLogins]
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
  }, [grantVolume, resolution, cluster, clusters, ensureToken, loadCluster]);

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
                    <h3 className="mb-2 flex items-center gap-1 text-sm font-medium">
                      <HardDrive className="h-3 w-3" /> CephFS volumes
                    </h3>
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
                              <TableCell>{formatBytes(v.bytesQuota)}</TableCell>
                              <TableCell className="text-right">
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
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </section>

                  <section>
                    <h3 className="mb-2 text-sm font-medium">S3 buckets</h3>
                    {bucketRows.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No bucket on {cluster}.
                        {principal.kind === "project" && (
                          <>
                            {" "}
                            RGW has no notion of a project owner, so a project&apos;s
                            buckets are its members&apos; buckets.
                          </>
                        )}
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Bucket</TableHead>
                            <TableHead>Owner</TableHead>
                            <TableHead>Size</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {bucketRows.map((b) => (
                            <TableRow key={b.name}>
                              <TableCell className="font-medium">{b.name}</TableCell>
                              <TableCell className="text-muted-foreground">{b.owner}</TableCell>
                              <TableCell>{formatBytes(b.sizeBytes)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </section>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Who can reach this storage</CardTitle>
                </CardHeader>
                <CardContent>
                  <EffectiveAccess
                    rows={access}
                    projectNames={projectNames}
                    emptyMessage={
                      principal.kind === "project"
                        ? "No cephx key grants access to this project's volumes. Members cannot mount them in a slice."
                        : "No cephx key grants access to this volume."
                    }
                  />
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

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
