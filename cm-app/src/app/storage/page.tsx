"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import SpinnerFullPage from "@/components/spinner-full-page";
import { useUserStatus } from "@/hooks/use-user-status";
import { getPerson, getProjects, getAllProjectsPaginated } from "@/services/core-api-service";
import { createIdToken } from "@/services/credential-manager-service";
import { getStorageProject, isStorageProjectOwnerRole } from "@/lib/config";
import { S3BucketsTab } from "@/components/s3-buckets-tab";
import {
  getClusterInfo,
  listSubvolumeGroups,
  listSubvolumes,
  listCephUsers,
  exportUserKeyrings,
  listProjectMembers,
} from "@/services/storage-service";
import { Checkbox } from "@/components/ui/checkbox";
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

interface SubvolumeInfo {
  name: string;
  group?: string;
  bytes_quota?: number | string;
  bytes_used?: number;
  state?: string;
  path?: string;
}

interface CephUser {
  entity: string;
  caps?: Record<string, string>;
  key?: string;
}

interface ProjectMember {
  uuid: string;
  bastion_login: string;
  membership_types: string[];
}

interface Project {
  uuid: string;
  name: string;
  active: boolean;
  project_type?: string;
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
const DEFAULT_CAPS_TEMPLATE = [
  { entity: "mon", cap: "allow r fsname={fs}" },
  { entity: "mds", cap: "allow rw fsname={fs} path={path}" },
  { entity: "osd", cap: "allow rw tag cephfs data={fs}" },
  { entity: "osd", cap: "allow rw tag cephfs metadata={fs}" },
];

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
  const [showSpinner, setShowSpinner] = useState(false);
  const [spinnerMessage, setSpinnerMessage] = useState("");

  // Subvolume state
  const [groups, setGroups] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [subvolumes, setSubvolumes] = useState<SubvolumeInfo[]>([]);
  const [allSubvolumes, setAllSubvolumes] = useState<SubvolumeInfo[]>([]);
  const [newSubvolName, setNewSubvolName] = useState("");
  const [newSubvolGroup, setNewSubvolGroup] = useState("");
  const [newSubvolSizeGiB, setNewSubvolSizeGiB] = useState(10);
  const [resizeSubvol, setResizeSubvol] = useState<SubvolumeInfo | null>(null);
  const [resizeSizeGiB, setResizeSizeGiB] = useState(10);

  // CephX caps apply state
  const [capsEntity, setCapsEntity] = useState("");
  const [capsSubvol, setCapsSubvol] = useState("");
  const [capsGroup, setCapsGroup] = useState("");
  const [capsTarget, setCapsTarget] = useState<"user" | "project">("user");

  // CephX users state
  const [cephUsers, setCephUsers] = useState<CephUser[]>([]);
  const [userSearch, setUserSearch] = useState("");

  // Multi-select state
  const [selectedSubvolumes, setSelectedSubvolumes] = useState<Set<string>>(new Set());
  const [selectedCephUsers, setSelectedCephUsers] = useState<Set<string>>(new Set());

  // Project members state
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  // False until the full member list has been fetched without error.
  const [projectMembersLoaded, setProjectMembersLoaded] = useState(false);

  // Projects state (for per-project subvolume creation)
  const [projects, setProjects] = useState<Project[]>([]);

  // Subvolume creation mode: per-user or per-project
  const [subvolScope, setSubvolScope] = useState<"user" | "project">("user");

  // Build a lookup from project UUID → project name
  const projectNameMap = new Map(projects.map((p) => [p.uuid, p.name]));

  // Format a group identifier for display: show project name if available
  // Normal user state
  const [myKeyring, setMyKeyring] = useState("");
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
  const loadProjectMembers = useCallback(async () => {
    try {
      const token = await ensureToken();
      const PAGE_SIZE = 200;
      let offset = 0;
      let allMembers: ProjectMember[] = [];

      // Paging here has two traps, both of which silently truncate.
      //
      // `offset` indexes the server's membership-UUID list, not the rows it
      // returns: it slices sorted_uuids[offset:offset+limit] and then DROPS any
      // row whose user has no bastion_login or whose lookup failed. So a full
      // page routinely comes back short, and "short page means last page" ends
      // the loop early. For the same reason `total` (the UUID count) is never
      // reached by counting returned members, so that cannot be the condition
      // either. Advance by the page size the server actually used, and stop on
      // `total`, which is measured in the same units as `offset`.
      let reportedTotal: number | undefined;
      let sawUnboundedPage = false;

      for (;;) {
        const { data: response } = await listProjectMembers(token, offset, PAGE_SIZE);
        const members: ProjectMember[] = Array.isArray(response.data)
          ? response.data
          : response.data || [];
        allMembers = allMembers.concat(members);

        if (typeof response.total === "number") reportedTotal = response.total;
        const step =
          typeof response.limit === "number" && response.limit > 0
            ? response.limit
            : PAGE_SIZE;
        offset += step;

        if (reportedTotal === undefined) {
          // No total to check against: the only safe stop is an empty page, and
          // completeness cannot be proven.
          sawUnboundedPage = true;
          if (members.length === 0) break;
        } else if (offset >= reportedTotal) {
          break;
        }

        if (offset > 100000) break; // runaway guard
      }

      setProjectMembers(allMembers);

      // Only claim completeness when the server told us how many memberships
      // exist and we walked past the end of that list. Members legitimately
      // absent (no bastion_login) are a different thing from a truncated fetch,
      // and only the latter must block a project-wide apply.
      const complete = reportedTotal !== undefined && offset >= reportedTotal;
      setProjectMembersLoaded(complete);
      if (!complete) {
        toast.warning(
          sawUnboundedPage
            ? "Storage user list returned no total; completeness cannot be verified."
            : "Storage user list may be incomplete."
        );
      }
    } catch (ex) {
      // Leave the flag false: an incomplete list must not be used to decide who
      // gets capabilities.
      setProjectMembersLoaded(false);
      toast.error(getErrorMessage(ex, "Failed to load project members."));
    }
  }, [ensureToken]);

  // Load active projects (for per-project subvolume creation)
  // Operators see all projects (paginated); normal users see only their own.
  const loadProjects = useCallback(async () => {
    try {
      const userId = sessionStorage.getItem("cmUserID");
      if (!userId) return;
      let results: Project[];
      if (isOperator) {
        results = (await getAllProjectsPaginated()) as Project[];
      } else {
        const { data: projRes } = await getProjects(userId);
        results = projRes.results || [];
      }
      const allProjects: Project[] = results
        .filter((p: Project) => p.active && p.project_type !== "service")
        .sort((a: Project, b: Project) => a.name.localeCompare(b.name));
      setProjects(allProjects);
    } catch (ex) {
      toast.error(getErrorMessage(ex, "Failed to load projects."));
    }
  }, [isOperator]);

  // Load data when cluster changes
  useEffect(() => {
    if (!selectedCluster || !roleLoaded) return;
    if (isOperator) {
      loadGroups();
      loadCephUsers();
      loadProjectMembers();
      loadProjects();
    } else {
      loadMyCredentials();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCluster, roleLoaded, isOperator]);

  // ----- Operator: Subvolumes -----

  const loadGroups = useCallback(async () => {
    try {
      const token = await ensureToken();
      const { data: response } = await listSubvolumeGroups(token, selectedCluster, DEFAULT_VOL);
      const rawGroups = Array.isArray(response.data) ? response.data : response.data || [];
      // Normalize: Dashboard may return objects {name, info} instead of strings
      const groupList: string[] = rawGroups.map((g: unknown) =>
        typeof g === "string" ? g : (g as Record<string, unknown>).name as string || String(g)
      );
      setGroups(groupList);
    } catch (ex) {
      toast.error(getErrorMessage(ex, "Failed to load subvolume groups."));
    }
  }, [selectedCluster, ensureToken]);

  // Parse raw subvolume API response into SubvolumeInfo[]
  const parseSubvolumes = (rawList: unknown[]): SubvolumeInfo[] => {
    return rawList.map((item: unknown) => {
      if (typeof item === "string") return { name: item } as SubvolumeInfo;
      const obj = item as Record<string, unknown>;
      const info = (obj.info as Record<string, unknown>) || {};
      return {
        name: (obj.name as string) || "",
        group: (obj.group_name as string) || (obj.group as string) || undefined,
        bytes_quota: (info.bytes_quota ?? obj.bytes_quota ?? undefined) as number | string | undefined,
        bytes_used: (info.bytes_used ?? obj.bytes_used ?? undefined) as number | undefined,
        state: (info.state as string) ?? (obj.state as string) ?? undefined,
        path: (info.path as string) ?? (obj.path as string) ?? undefined,
      } as SubvolumeInfo;
    });
  };

  const loadSubvolumes = useCallback(
    async (group?: string) => {
      try {
        const token = await ensureToken();

        if (group) {
          // Load subvolumes for a specific group
          const { data: response } = await listSubvolumes(
            token, selectedCluster, DEFAULT_VOL, group, true
          );
          const rawList = Array.isArray(response.data) ? response.data : response.data || [];
          setSubvolumes(parseSubvolumes(rawList));
        } else {
          // "All groups": fetch default (no-group) + each known group in parallel
          const fetches = [
            listSubvolumes(token, selectedCluster, DEFAULT_VOL, undefined, true),
            ...groups.map((g) =>
              listSubvolumes(token, selectedCluster, DEFAULT_VOL, g, true)
            ),
          ];
          const results = await Promise.allSettled(fetches);
          const merged: SubvolumeInfo[] = [];
          for (const result of results) {
            if (result.status === "fulfilled") {
              const rawList = Array.isArray(result.value.data.data)
                ? result.value.data.data
                : result.value.data.data || [];
              merged.push(...parseSubvolumes(rawList));
            }
          }
          setSubvolumes(merged);
          setAllSubvolumes(merged);
        }
      } catch (ex) {
        toast.error(getErrorMessage(ex, "Failed to load subvolumes."));
      }
    },
    [selectedCluster, ensureToken, groups]
  );

  // Load all subvolumes across all groups (for CephX caps dropdown)
  const loadAllSubvolumes = useCallback(
    async () => {
      try {
        const token = await ensureToken();
        const fetches = [
          listSubvolumes(token, selectedCluster, DEFAULT_VOL, undefined, true),
          ...groups.map((g) =>
            listSubvolumes(token, selectedCluster, DEFAULT_VOL, g, true)
          ),
        ];
        const results = await Promise.allSettled(fetches);
        const merged: SubvolumeInfo[] = [];
        for (const result of results) {
          if (result.status === "fulfilled") {
            const rawList = Array.isArray(result.value.data.data)
              ? result.value.data.data
              : result.value.data.data || [];
            merged.push(...parseSubvolumes(rawList));
          }
        }
        setAllSubvolumes(merged);
      } catch (ex) {
        toast.error(getErrorMessage(ex, "Failed to load all subvolumes."));
      }
    },
    [selectedCluster, ensureToken, groups]
  );

  useEffect(() => {
    if (selectedCluster && isOperator) {
      loadSubvolumes(selectedGroup || undefined);
    }
  }, [selectedGroup, selectedCluster, isOperator, loadSubvolumes]);

  // Keep allSubvolumes updated when groups are loaded
  useEffect(() => {
    if (selectedCluster && isOperator && groups.length > 0) {
      loadAllSubvolumes();
    }
  }, [selectedCluster, isOperator, groups, loadAllSubvolumes]);

  const filteredCephUsers = cephUsers.filter((u) =>
    (u.entity || "").toLowerCase().includes(userSearch.toLowerCase())
  );

  // Clear subvolume selection when data changes
  useEffect(() => {
    setSelectedSubvolumes(new Set());
  }, [selectedGroup, selectedCluster, subvolumes]);

  // Clear CephX user selection when data changes
  useEffect(() => {
    setSelectedCephUsers(new Set());
  }, [selectedCluster, cephUsers]);

  // Subvolume selection helpers
  const subvolKey = (sv: SubvolumeInfo) => `${sv.group || ""}::${sv.name}`;

  // CephX user selection helpers
  // Batch delete handlers
  // Apply CephX caps (single user or entire project)
  // ----- Operator: CephX Users -----

  const loadCephUsers = useCallback(async () => {
    try {
      const token = await ensureToken();
      const { data: response } = await listCephUsers(token, selectedCluster);
      const rawUsers = Array.isArray(response.data) ? response.data : response.data || [];
      // Map API shape (user_entity, capabilities[]) to frontend shape (entity, caps{})
      const users: CephUser[] = rawUsers.map((u: Record<string, unknown>) => {
        const caps: Record<string, string> = {};
        const capabilities = (u.capabilities as Array<{ entity: string; cap: string } | null>) || [];
        for (const c of capabilities) {
          if (c && c.entity && c.cap) {
            caps[c.entity] = caps[c.entity] ? `${caps[c.entity]}; ${c.cap}` : c.cap;
          }
        }
        return {
          entity: (u.user_entity as string) || (u.entity as string) || "",
          caps: Object.keys(caps).length > 0 ? caps : undefined,
        };
      });
      setCephUsers(users);
    } catch (ex) {
      toast.error(getErrorMessage(ex, "Failed to load storage users."));
    }
  }, [selectedCluster, ensureToken]);

  // Extract keyring text from export API response
  const extractKeyring = (response: Record<string, unknown>, entity: string): string => {
    // Shape: { clusters: { cluster: { entity: keyring_text } }, ... }
    const clustersMap = response.clusters as Record<string, Record<string, string>> | undefined;
    if (clustersMap?.[selectedCluster]?.[entity]) {
      return clustersMap[selectedCluster][entity];
    }
    // No keyring found for this entity on this cluster
    return "";
  };

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
        const keyring = extractKeyring(response, entity);
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

  if (showSpinner) {
    return (
      <div className="container mx-auto min-h-[80vh] mt-8 mb-8">
        <SpinnerFullPage showSpinner text={spinnerMessage} />
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
                    myVolumes.map((v) => (
                      <div key={v.path} className="rounded border p-2">
                        <div className="text-sm font-medium">
                          {v.label}
                          {v.wide && (
                            <span className="ml-2 text-xs text-amber-700">
                              (every volume in this group)
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
                    ))
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
