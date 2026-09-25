"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import SpinnerFullPage from "@/components/spinner-full-page";
import { useUserStatus } from "@/hooks/use-user-status";
import { getPerson } from "@/services/core-api-service";
import { createIdToken } from "@/services/credential-manager-service";
import { getStorageProject, isStorageProjectOwnerRole } from "@/lib/config";
import { S3BucketsTab } from "@/components/s3-buckets-tab";
import {
  getClusterInfo,
  exportUserKeyrings,
} from "@/services/storage-service";
import {
  Copy,
  Download,
  FolderDown,
} from "lucide-react";
import JSZip from "jszip";
import {
  effectiveAccess,
  isBroadGrant,
  parseKeyring as parseCephKeyring,
} from "@/lib/ceph-caps";
import { NO_GROUP, USER_GROUP } from "@/lib/principals";
import {
  collectionUrl,
  listMyCollections,
  MyCollection,
} from "@/services/globus-service";

// Types

interface ClusterInfo {
  cluster: string;
  fsid: string;
  mons: Array<{ name: string; v2: string | null; v1: string | null }>;
  mon_host: string;
  ceph_conf_minimal: string;
  /** RGW S3 endpoints, in preference order. Absent on older Ceph Managers. */
  s3_endpoints?: string[];
  error: string | null;
}

// Utility

function getErrorMessage(error: unknown, fallback: string): string {
  try {
    const err = error as {
      response?: { data?: { detail?: string; errors?: Array<{ details?: string; message?: string }> } };
    };
    if (err?.response?.data?.detail) return err.response.data.detail;
    if (err?.response?.data?.errors?.[0]) {
      const e = err.response.data.errors[0];
      return e.details || e.message || fallback;
    }
  } catch {
    // fall through
  }
  return fallback;
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard.");
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    toast.success("Copied to clipboard.");
  }
}

/**
 * Pull one keyring out of an export response.
 *
 * `/cluster/user/export` answers { clusters: { <cluster>: { <entity>: text } } },
 * which is not the `data` envelope the other endpoints use - reading `data.data`
 * here yields nothing for a call that succeeded.
 *
 * At module scope so it closes over nothing and is not a hook dependency.
 */
function extractKeyring(
  response: Record<string, unknown>,
  cluster: string,
  entity: string
): string {
  const clustersMap = response.clusters as
    | Record<string, Record<string, string>>
    | undefined;
  return clustersMap?.[cluster]?.[entity] ?? "";
}

function downloadFile(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- Keyring parsing & bundle generation (mirrors CephFsUtils from fablib) ----

interface ParsedKeyring {
  entity: string;   // e.g. "client.alice"
  user: string;     // e.g. "alice"
  secret: string;   // base64 key
  fsPaths: Array<{ fsname: string; path: string }>;
}

function parseKeyring(text: string): ParsedKeyring {
  // Unescape JSON-encoded strings
  let raw = text;
  try { raw = JSON.parse(text); } catch { /* not JSON, use as-is */ }

  const mEnt = raw.match(/\[(client\.[^\]]+)\]/);
  if (!mEnt) throw new Error("Could not find [client.<name>] stanza in keyring");
  const entity = mEnt[1];
  const user = entity.split(".").slice(1).join(".");

  const mKey = raw.match(/^\s*key\s*=\s*([A-Za-z0-9+/=]+)\s*$/m);
  if (!mKey) throw new Error("Could not find 'key =' line in keyring");
  const secret = mKey[1];

  // Parse MDS caps
  const mCaps = raw.match(/caps\s+mds\s*=\s*"([^"]+)"/);
  const fsPaths: Array<{ fsname: string; path: string }> = [];
  if (mCaps) {
    const clauses = mCaps[1].split(",").map((c) => c.trim()).filter(Boolean);
    const seenFs: string[] = [];
    for (const cl of clauses) {
      const mfs = cl.match(/fsname=([^,\s]+)/);
      if (mfs && !seenFs.includes(mfs[1])) seenFs.push(mfs[1]);
    }
    const defaultFs = seenFs.length === 1 ? seenFs[0] : null;
    const seen = new Set<string>();
    for (const cl of clauses) {
      const mfs = cl.match(/fsname=([^,\s]+)/);
      const mp = cl.match(/path=([^,\s]+)/);
      if (!mp) continue;
      const fsn = mfs ? mfs[1] : defaultFs;
      if (!fsn) continue;
      const key = `${fsn}:${mp[1]}`;
      if (!seen.has(key)) {
        seen.add(key);
        fsPaths.push({ fsname: fsn, path: mp[1] });
      }
    }
  }
  return { entity, user, secret, fsPaths };
}

function slugFromPath(p: string): string {
  return p.replace(/^\/+/, "").replace(/[^A-Za-z0-9._-]+/g, "_") || "root";
}

function generateMountScript(
  cluster: string,
  entity: string,
  user: string,
  fsPaths: Array<{ fsname: string; path: string }>,
  mountRoot: string = "/mnt/cephfs"
): string {
  const blocks = fsPaths.map(({ fsname, path }) => {
    const slug = slugFromPath(path);
    const mnt = `$MNT_BASE/$CLUSTER/$USER_NAME/${slug}`;
    return `
# --- ${fsname}:${path} ---
echo "Preparing mountpoint: ${mnt}"
sudo mkdir -p "${mnt}"

if mountpoint -q "${mnt}"; then
  current_src="$(findmnt -n -o SOURCE --target "${mnt}" 2>/dev/null || true)"
  echo "Already mounted at ${mnt} (SOURCE=\${current_src:-unknown}). Skipping."
else
  sudo chown "\${owner_uid}:\${owner_gid}" "${mnt}" || true
  sudo chmod 755 "${mnt}" || true

  echo "Mounting (fs=) fs=${fsname} path=${path} -> ${mnt}"
  set +e
  sudo mount -t ceph ":${path}" "${mnt}" -o name="$USER_NAME",secretfile="$SECRET_TGT",conf="$CONF_TGT",fs="${fsname}",_netdev,noatime
  rc=$?
  set -e
  if [[ $rc -eq 22 ]]; then
    echo "fs= not accepted (EINVAL). Retrying with mds_namespace=${fsname} ..."
    sudo mount -t ceph ":${path}" "${mnt}" -o name="$USER_NAME",secretfile="$SECRET_TGT",conf="$CONF_TGT",mds_namespace="${fsname}",_netdev,noatime
    rc=$?
  fi
  if [[ $rc -ne 0 ]]; then
    echo "ERROR: mount failed with rc=$rc for ${mnt}"
    exit $rc
  fi
  sudo chown -R "\${owner_uid}:\${owner_gid}" "${mnt}" || true
fi
`;
  });

  return `#!/usr/bin/env bash
set -euo pipefail

here="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
CLUSTER="${cluster}"
ENTITY="${entity}"
USER_NAME="${user}"
MNT_BASE="\${MNT_BASE:-${mountRoot}}"

echo "Using cluster: $CLUSTER"
echo "Bundle dir:   $here"
echo "Mount base:   $MNT_BASE"

if [[ "$CLUSTER" == "ceph" || -z "$CLUSTER" ]]; then
  CONF_TGT="/etc/ceph/ceph.conf"
  KEYRING_TGT="/etc/ceph/ceph.client.$USER_NAME.keyring"
  SECRET_TGT="/etc/ceph/ceph.client.$USER_NAME.secret"
else
  CONF_TGT="/etc/ceph/\${CLUSTER}.conf"
  KEYRING_TGT="/etc/ceph/\${CLUSTER}.client.$USER_NAME.keyring"
  SECRET_TGT="/etc/ceph/\${CLUSTER}.client.$USER_NAME.secret"
fi

copy_if_changed() {
  local src="$1" dst="$2" mode="$3"
  if [[ ! -f "$dst" ]] || ! cmp -s "$src" "$dst"; then
    sudo install -m "$mode" -D "$src" "$dst"
  fi
}

sudo mkdir -p /etc/ceph
copy_if_changed "$here/ceph.conf" "$CONF_TGT" 644
copy_if_changed "$here/ceph.client.$USER_NAME.keyring" "$KEYRING_TGT" 600
copy_if_changed "$here/ceph.client.$USER_NAME.secret" "$SECRET_TGT" 600

owner_uid="\${SUDO_UID:-}"
owner_gid="\${SUDO_GID:-}"
if [[ -z "$owner_uid" || -z "$owner_gid" ]]; then
  owner_uid="$(stat -c %u "$here")"
  owner_gid="$(stat -c %g "$here")"
fi

sudo mkdir -p "$MNT_BASE/$CLUSTER/$USER_NAME"
if ! mountpoint -q "$MNT_BASE/$CLUSTER/$USER_NAME"; then
  sudo chown "\${owner_uid}:\${owner_gid}" "$MNT_BASE/$CLUSTER/$USER_NAME" || true
  sudo chmod 755 "$MNT_BASE/$CLUSTER/$USER_NAME" || true
fi
${blocks.join("")}
echo "All mounts attempted."
echo "To unmount:"
echo "  sudo umount -l $MNT_BASE/$CLUSTER/$USER_NAME/*"
`;
}

async function generateAndDownloadBundle(
  cluster: string,
  cephConfText: string,
  keyringText: string,
) {
  const parsed = parseKeyring(keyringText);
  const { entity, user, secret, fsPaths } = parsed;

  const zip = new JSZip();
  const folder = zip.folder(cluster)!;

  // ceph.conf
  folder.file("ceph.conf", cephConfText);

  // keyring
  folder.file(`ceph.client.${user}.keyring`, keyringText);

  // secret
  folder.file(`ceph.client.${user}.secret`, secret + "\n");

  // mount script (only if MDS caps paths were found)
  if (fsPaths.length > 0) {
    const script = generateMountScript(cluster, entity, user, fsPaths);
    folder.file(`mount_${user}.sh`, script, { unixPermissions: "750" });
  }

  const blob = await zip.generateAsync({ type: "blob", platform: "UNIX" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ceph-bundle-${user}-${cluster}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

// Default volume name
const DEFAULT_VOL = "CEPH-FS-01";

// Default CephX capabilities template

export default function StoragePage() {
  const { cmUserStatus } = useUserStatus();

  // Auth & role state
  const [isOperator, setIsOperator] = useState(false);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [storageToken, setStorageToken] = useState("");
  const [tokenCreatedAt, setTokenCreatedAt] = useState(0);
  const [bastionLogin, setBastionLogin] = useState("");

  // Cluster state
  const [clusters, setClusters] = useState<ClusterInfo[]>([]);
  const [selectedCluster, setSelectedCluster] = useState("");

  // Loading

  // Subvolume state

  // CephX caps apply state

  // CephX users state

  // Multi-select state

  // Project members state
  // False until the full member list has been fetched without error.

  // Projects state (for per-project subvolume creation)

  // Subvolume creation mode: per-user or per-project

  // Build a lookup from project UUID → project name

  // Format a group identifier for display: show project name if available
  // Normal user state
  const [myKeyring, setMyKeyring] = useState("");
  const [myCollections, setMyCollections] = useState<MyCollection[]>([]);
  // Token management
  const ensureToken = useCallback(async (): Promise<string> => {
    const TOKEN_LIFETIME_MS = 30 * 60 * 1000;
    if (storageToken && Date.now() - tokenCreatedAt < TOKEN_LIFETIME_MS) {
      return storageToken;
    }
    try {
      const projectName = getStorageProject();
      const { getProjects } = await import("@/services/core-api-service");
      const userId = sessionStorage.getItem("cmUserID");
      if (!userId) throw new Error("Not logged in");
      const { data: projRes } = await getProjects(userId);
      const projects = projRes.results || [];
      const storageProject = projects.find(
        (p: { name: string }) => p.name === projectName
      );
      if (!storageProject) {
        const activeProject = projects.find((p: { active: boolean }) => p.active);
        if (!activeProject) throw new Error("No active project found");
        const { data: res } = await createIdToken(
          activeProject.uuid,
          "all",
          1,
          "storage-gui-session"
        );
        const token = res.data[0].id_token;
        setStorageToken(token);
        setTokenCreatedAt(Date.now());
        return token;
      }
      const { data: res } = await createIdToken(
        storageProject.uuid,
        "all",
        1,
        "storage-gui-session"
      );
      const token = res.data[0].id_token;
      setStorageToken(token);
      setTokenCreatedAt(Date.now());
      return token;
    } catch (ex) {
      const msg = getErrorMessage(ex, "Failed to create storage session token.");
      toast.error(msg);
      throw ex;
    }
  }, [storageToken, tokenCreatedAt]);

  // Which of my volumes are on Globus. Tolerated separately: a deployment with
  // no Globus state store answers 500, and that must not take the keyring and
  // mount instructions down with it - they have nothing to do with Globus.
  useEffect(() => {
    if (cmUserStatus !== "active" || !selectedCluster) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await ensureToken();
        const { data } = await listMyCollections(token);
        if (!cancelled) setMyCollections(data?.collections ?? []);
      } catch {
        if (!cancelled) setMyCollections([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cmUserStatus, selectedCluster, ensureToken]);

  // Load role info
  useEffect(() => {
    if (cmUserStatus !== "active") return;
    async function loadRole() {
      try {
        const userId = sessionStorage.getItem("cmUserID");
        if (!userId) return;
        const { data: res } = await getPerson(userId);
        const person = res.results[0];
        setBastionLogin(person.bastion_login || person.email?.split("@")[0] || "");
        const roles: Array<{ name: string }> = person.roles || [];
        // Mirror the Ceph Manager's own rule: an operator is a facility admin
        // OR an owner of the FABRIC Ceph service project. Project ownership
        // shows up in the roles list as "<project-uuid>-po".
        const isFacOp = roles.some(
          (r) =>
            r.name === "facility-operators" ||
            r.name === "facility-operator" ||
            r.name === "Facility Operators"
        );
        const isCephProjectOwner = roles.some((r) =>
          isStorageProjectOwnerRole(r.name)
        );
        setIsOperator(isFacOp || isCephProjectOwner);
        setRoleLoaded(true);
      } catch (ex) {
        const msg = getErrorMessage(ex, "Failed to load user profile.");
        toast.error(msg);
        setRoleLoaded(true);
      }
    }
    loadRole();
  }, [cmUserStatus]);

  // Load cluster info once role is loaded
  useEffect(() => {
    if (!roleLoaded || cmUserStatus !== "active") return;
    async function loadClusters() {
      try {
        const token = await ensureToken();
        const { data: response } = await getClusterInfo(token);
        // API returns { data: [{ cluster, fsid, mons, mon_host, ... }], ... }
        const items: ClusterInfo[] = (response.data || []).filter(
          (item: ClusterInfo) => item.cluster && !item.error
        );
        setClusters(items);
        if (items.length > 0 && !selectedCluster) {
          setSelectedCluster(items[0].cluster);
        }
      } catch (ex) {
        console.error("loadClusters error:", ex);
        toast.error(getErrorMessage(ex, "Failed to load cluster information."));
      }
    }
    loadClusters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleLoaded, cmUserStatus]);

  // Load project members (operator only) — fetches all pages
  // Load active projects (for per-project subvolume creation)
  // Operators see all projects (paginated); normal users see only their own.
  // Load data when cluster changes
  useEffect(() => {
    if (!selectedCluster || !roleLoaded) return;
    // Only the caller's own credentials. The operator data this page used to
    // prefetch - every cephx entity, every subvolume, every project, and the
    // paged member list - is the admin page's business now, and fetching it
    // here cost an operator four large requests for something nothing rendered.
    {
      loadMyCredentials();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCluster, roleLoaded, isOperator]);

  // ----- Operator: Subvolumes -----

  // Parse raw subvolume API response into SubvolumeInfo[]
  // Subvolume selection helpers

  // CephX user selection helpers
  // Batch delete handlers
  // Apply CephX caps (single user or entire project)
  // ----- Operator: CephX Users -----

  // Extract keyring text from export API response
  // ----- Normal User: My Credentials -----

  const loadMyCredentials = useCallback(async () => {
    if (!bastionLogin || !selectedCluster) return;
    setMyKeyring("");
    try {
      const token = await ensureToken();
      const entity = `client.${bastionLogin}`;

      // Export keyring
      try {
        const { data: response } = await exportUserKeyrings(token, selectedCluster, [entity]);
        const keyring = extractKeyring(response, selectedCluster, entity);
        setMyKeyring(keyring);
      } catch {
        setMyKeyring("");
      }

    } catch {
      // token error already toasted
    }
  }, [bastionLogin, selectedCluster, ensureToken]);

  // Redirect if not active
  if (cmUserStatus !== "active") {
    return (
      <div className="container mx-auto min-h-[80vh] mt-8 mb-8 px-4">
        <SpinnerFullPage
          showSpinner={cmUserStatus === ""}
          text="Checking authentication..."
        />
        {cmUserStatus !== "" && (
          <div className="bg-fabric-warning/10 border border-fabric-warning/30 text-fabric-dark rounded p-4">
            Please log in to access Storage management.
          </div>
        )}
      </div>
    );
  }

  if (!roleLoaded) {
    return (
      <div className="container mx-auto min-h-[80vh] mt-8 mb-8 px-4">
        <SpinnerFullPage showSpinner text="Loading user profile..." />
      </div>
    );
  }

  // Cluster selector (shared between operator and normal user)
  const clusterSelector = (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Settings</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <div>
            <Label htmlFor="cluster">Cluster</Label>
            <select
              id="cluster"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
              value={selectedCluster}
              onChange={(e) => setSelectedCluster(e.target.value)}
            >
              {clusters.map((c) => (
                <option key={c.cluster} value={c.cluster}>
                  {c.cluster}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Volume</Label>
            <div className="h-9 flex items-center px-3 text-sm text-muted-foreground">
              {DEFAULT_VOL}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // RGW S3 endpoints for the selected cluster. Older Ceph Managers omit these,
  // in which case the S3 tab shows no endpoint rather than a wrong one.
  const s3EndpointsForCluster =
    clusters.find((c) => c.cluster === selectedCluster)?.s3_endpoints || [];

  // The operator view moved to /storage/admin, which is organised principal ->
  // storage -> access. This page is now "my storage" for everyone, operators
  // included - they have volumes of their own like anyone else, and the banner
  // below is how they get there.

  // ===== NORMAL USER VIEW =====
  const userEntity = `client.${bastionLogin}`;

  // What this person can actually reach, read out of their own keyring.
  //
  // Listing cephx entities is operator-only, but the keyring this page already
  // exports carries the mds caps, and those caps ARE the answer: one clause per
  // grant, each naming an exact path. The page used to show a single command
  // mounting the filesystem ROOT, which a path-restricted key is refused for -
  // verified against a live client as `mount error 13 = Permission denied`,
  // while the same key mounting its granted path succeeds and lists 86 entries.
  // So the command shown here had never worked, while the bundle's script -
  // built from these same paths - always had.
  const myVolumes = (() => {
    if (!myKeyring) return [];
    const entity = parseCephKeyring(myKeyring);
    if (!entity) return [];
    return effectiveAccess(entity).map((g) => {
      const wide = isBroadGrant(g);
      const personal = g.group === USER_GROUP || g.group === NO_GROUP;
      const label = personal
        ? wide
          ? "All personal volumes"
          : "Your personal volume"
        : wide
        ? `Every volume in project ${g.group}`
        : `${g.volume} (project volume)`;
      return {
        path: g.path,
        fsname: g.fsname || "CEPH-FS-01",
        label,
        wide,
        mountName: g.volume || slugFromPath(g.path),
      };
    });
  })();

  return (
    <div className="container mx-auto min-h-[80vh] mt-8 mb-8 px-4">
      <h1 className="text-xl font-semibold text-fabric-dark mb-4">My Storage</h1>
      {isOperator && (
        <div className="mb-4 rounded border border-fabric-primary/30 bg-fabric-primary/5 p-3 text-sm">
          This page shows your own storage. To administer other people&apos;s, go
          to{" "}
          <a className="underline" href="/storage/admin">
            Storage Admin
          </a>
          .
        </div>
      )}
      {clusterSelector}

      <Tabs defaultValue="posix">
        <TabsList>
          <TabsTrigger value="posix">POSIX Volumes</TabsTrigger>
          <TabsTrigger value="s3">S3 Buckets</TabsTrigger>
        </TabsList>

        <TabsContent value="s3" className="space-y-4">
          <S3BucketsTab
            cluster={selectedCluster}
            s3Endpoints={s3EndpointsForCluster}
            isOperator={false}
            bastionLogin={bastionLogin}
            projectMembers={[]}
            ensureToken={ensureToken}
            getErrorMessage={getErrorMessage}
          />
        </TabsContent>

        <TabsContent value="posix">
      <div className="space-y-4">
        {/* CephFS Credentials */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">My CephFS Credentials</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm">
              <span className="text-muted-foreground">Entity: </span>
              <span className="font-mono">{userEntity}</span>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Cluster: </span>
              <Badge className="bg-fabric-success text-white">
                {selectedCluster}
              </Badge>
            </div>

            {myKeyring ? (
              <>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(myKeyring)}
                  >
                    <Copy className="h-3 w-3 mr-1" /> Copy Keyring
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      downloadFile(
                        `ceph-keyring-${bastionLogin}.conf`,
                        myKeyring
                      )
                    }
                  >
                    <Download className="h-3 w-3 mr-1" /> Download Keyring
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        const cc = clusters.find((c) => c.cluster === selectedCluster);
                        if (!cc?.ceph_conf_minimal) {
                          toast.error("Cluster config not available.");
                          return;
                        }
                        await generateAndDownloadBundle(selectedCluster, cc.ceph_conf_minimal, myKeyring);
                        toast.success("Bundle downloaded.");
                      } catch (ex) {
                        toast.error(getErrorMessage(ex, "Failed to generate bundle."));
                      }
                    }}
                    title="Download ceph.conf, keyring, secret, and mount script as a zip"
                  >
                    <FolderDown className="h-3 w-3 mr-1" /> Download Bundle
                  </Button>
                </div>

                <div className="space-y-3">
                  <Label className="text-xs text-muted-foreground">
                    Volumes you can reach on {selectedCluster}
                  </Label>
                  {myVolumes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Your key grants no filesystem paths on this cluster, so
                      there is nothing to mount here.
                    </p>
                  ) : (
                    myVolumes.map((v) => {
                      // Matched on the volume name within this cluster. A wide
                      // grant covers many volumes and names none of them, so it
                      // gets no link rather than an arbitrary one.
                      const published = v.wide
                        ? undefined
                        : myCollections.find(
                            (c) =>
                              c.cluster === selectedCluster && c.volume === v.mountName
                          );
                      return (
                      <div key={v.path} className="rounded border p-2">
                        <div className="text-sm font-medium">
                          {v.label}
                          {v.wide && (
                            <span className="ml-2 text-xs text-amber-700">
                              (every volume in this group)
                            </span>
                          )}
                          {published?.collection_id && (
                            <a
                              className="ml-2 text-xs underline"
                              href={collectionUrl(published.collection_id)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              open in Globus
                            </a>
                          )}
                          {published && !published.collection_id && (
                            // Requested but not yet converged. Saying so beats
                            // a link that 404s and beats silence, which reads
                            // as "not available".
                            <span className="ml-2 text-xs text-muted-foreground">
                              Globus: {published.state}
                            </span>
                          )}
                        </div>
                        <pre className="bg-muted p-3 rounded text-xs overflow-auto mt-1">
{`sudo mount -t ceph :${v.path} /mnt/${v.mountName} \\
  -o name=${bastionLogin},secretfile=/etc/ceph/${bastionLogin}.secret,fs=${v.fsname}`}
                        </pre>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-1"
                          onClick={() =>
                            copyToClipboard(
                              `sudo mount -t ceph :${v.path} /mnt/${v.mountName} -o name=${bastionLogin},secretfile=/etc/ceph/${bastionLogin}.secret,fs=${v.fsname}`
                            )
                          }
                        >
                          <Copy className="h-3 w-3 mr-1" /> Copy
                        </Button>
                      </div>
                      );
                    })
                  )}
                  <p className="text-xs text-muted-foreground">
                    The path is not decoration: your key is restricted to it, so
                    mounting the filesystem root is refused with{" "}
                    <span className="font-mono">mount error 13</span>. The
                    downloadable bundle contains a script that does all of this,
                    including placing the secret file.
                  </p>
                </div>
              </>
            ) : (
              <div className="bg-fabric-warning/10 border border-fabric-warning/30 text-fabric-dark rounded p-3 text-sm">
                No CephFS keyring found for your account on this cluster.
              </div>
            )}
          </CardContent>
        </Card>

      </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
