"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import SpinnerFullPage from "@/components/spinner-full-page";
import { useUserStatus } from "@/hooks/use-user-status";
import { getPerson, getProjects } from "@/services/core-api-service";
import { createIdToken } from "@/services/credential-manager-service";
import { getStorageProject } from "@/lib/config";
import {
  getClusterInfo,
  listSubvolumeGroups,
  listSubvolumes,
  createOrResizeSubvolume,
  deleteSubvolume,
  listCephUsers,
  applyUserCaps,
  exportUserKeyrings,
  deleteCephUser,
  listProjectMembers,
} from "@/services/storage-service";
import {
  Copy,
  Download,
  RefreshCw,
  Trash2,
  Plus,
  Search,
  KeyRound,
} from "lucide-react";

// Types

interface ClusterInfo {
  cluster: string;
  fsid: string;
  mons: Array<{ name: string; v2: string | null; v1: string | null }>;
  mon_host: string;
  ceph_conf_minimal: string;
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

function formatBytes(bytes: number | string | undefined): string {
  if (bytes === undefined || bytes === "infinite" || bytes === null) return "unlimited";
  const n = typeof bytes === "string" ? parseInt(bytes) : bytes;
  if (isNaN(n) || n === 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  const i = Math.floor(Math.log(n) / Math.log(1024));
  return `${(n / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
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

  // Project members state
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);

  // Projects state (for per-project subvolume creation)
  const [projects, setProjects] = useState<Project[]>([]);

  // Subvolume creation mode: per-user or per-project
  const [subvolScope, setSubvolScope] = useState<"user" | "project">("user");

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
      const userId = localStorage.getItem("cmUserID");
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
        const userId = localStorage.getItem("cmUserID");
        if (!userId) return;
        const { data: res } = await getPerson(userId);
        const person = res.results[0];
        setBastionLogin(person.bastion_login || person.email?.split("@")[0] || "");
        const roles: Array<{ name: string }> = person.roles || [];
        const isFacOp = roles.some(
          (r) =>
            r.name === "facility-operators" ||
            r.name === "Facility Operators"
        );
        setIsOperator(isFacOp);
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

  // Load project members (operator only)
  const loadProjectMembers = useCallback(async () => {
    try {
      const token = await ensureToken();
      const { data: response } = await listProjectMembers(token);
      const members: ProjectMember[] = Array.isArray(response.data) ? response.data : response.data || [];
      setProjectMembers(members);
    } catch (ex) {
      toast.error(getErrorMessage(ex, "Failed to load project members."));
    }
  }, [ensureToken]);

  // Load active projects (for per-project subvolume creation)
  const loadProjects = useCallback(async () => {
    try {
      const userId = localStorage.getItem("cmUserID");
      if (!userId) return;
      const { data: projRes } = await getProjects(userId);
      const allProjects: Project[] = (projRes.results || [])
        .filter((p: Project) => p.active)
        .sort((a: Project, b: Project) => a.name.localeCompare(b.name));
      setProjects(allProjects);
    } catch (ex) {
      toast.error(getErrorMessage(ex, "Failed to load projects."));
    }
  }, []);

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
      const groupList: string[] = Array.isArray(response.data) ? response.data : response.data || [];
      setGroups(groupList);
    } catch (ex) {
      toast.error(getErrorMessage(ex, "Failed to load subvolume groups."));
    }
  }, [selectedCluster, ensureToken]);

  const loadSubvolumes = useCallback(
    async (group?: string) => {
      try {
        const token = await ensureToken();
        const { data: response } = await listSubvolumes(
          token,
          selectedCluster,
          DEFAULT_VOL,
          group || undefined,
          true
        );
        const rawList = Array.isArray(response.data) ? response.data : response.data || [];
        // Normalize: Ceph Dashboard may nest info fields under an "info" key
        const svList: SubvolumeInfo[] = rawList.map((item: Record<string, unknown>) => {
          if (typeof item === "string") return { name: item };
          const info = (item.info as Record<string, unknown>) || {};
          return {
            name: (item.name as string) || "",
            group: (item.group_name as string) || (item.group as string) || undefined,
            bytes_quota: info.bytes_quota ?? item.bytes_quota ?? undefined,
            bytes_used: info.bytes_used ?? item.bytes_used ?? undefined,
            state: (info.state as string) ?? (item.state as string) ?? undefined,
            path: (info.path as string) ?? (item.path as string) ?? undefined,
          };
        });
        setSubvolumes(svList);
      } catch (ex) {
        toast.error(getErrorMessage(ex, "Failed to load subvolumes."));
      }
    },
    [selectedCluster, ensureToken]
  );

  useEffect(() => {
    if (selectedCluster && isOperator) {
      loadSubvolumes(selectedGroup || undefined);
    }
  }, [selectedGroup, selectedCluster, isOperator, loadSubvolumes]);

  const handleCreateSubvolume = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubvolName) return;
    setShowSpinner(true);
    setSpinnerMessage("Creating subvolume...");
    try {
      const token = await ensureToken();
      // Per-User: no group; Per-Project: group from dropdown
      const groupName = subvolScope === "user" ? undefined : (newSubvolGroup || undefined);
      await createOrResizeSubvolume(token, selectedCluster, DEFAULT_VOL, {
        subvol_name: newSubvolName,
        group_name: groupName,
        size: newSubvolSizeGiB * 1024 * 1024 * 1024,
        mode: "0777",
      });
      toast.success(`Subvolume "${newSubvolName}" created.`);
      setNewSubvolName("");
      loadSubvolumes(selectedGroup || undefined);
    } catch (ex) {
      toast.error(getErrorMessage(ex, "Failed to create subvolume."));
    } finally {
      setShowSpinner(false);
      setSpinnerMessage("");
    }
  };

  const handleResizeSubvolume = async () => {
    if (!resizeSubvol) return;
    setShowSpinner(true);
    setSpinnerMessage("Resizing subvolume...");
    try {
      const token = await ensureToken();
      await createOrResizeSubvolume(token, selectedCluster, DEFAULT_VOL, {
        subvol_name: resizeSubvol.name,
        group_name: resizeSubvol.group || undefined,
        size: resizeSizeGiB * 1024 * 1024 * 1024,
      });
      toast.success(`Subvolume "${resizeSubvol.name}" resized.`);
      setResizeSubvol(null);
      loadSubvolumes(selectedGroup || undefined);
    } catch (ex) {
      toast.error(getErrorMessage(ex, "Failed to resize subvolume."));
    } finally {
      setShowSpinner(false);
      setSpinnerMessage("");
    }
  };

  const handleDeleteSubvolume = async (sv: SubvolumeInfo) => {
    setShowSpinner(true);
    setSpinnerMessage("Deleting subvolume...");
    try {
      const token = await ensureToken();
      await deleteSubvolume(
        token,
        selectedCluster,
        DEFAULT_VOL,
        sv.name,
        sv.group || undefined
      );
      toast.success(`Subvolume "${sv.name}" deleted.`);
      loadSubvolumes(selectedGroup || undefined);
    } catch (ex) {
      toast.error(getErrorMessage(ex, "Failed to delete subvolume."));
    } finally {
      setShowSpinner(false);
      setSpinnerMessage("");
    }
  };

  // Apply CephX caps (single user or entire project)
  const handleApplyCaps = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!capsSubvol) return;
    setShowSpinner(true);

    // Determine which users to apply caps to
    const logins: string[] = [];
    if (capsTarget === "user") {
      if (!capsEntity) return;
      // capsEntity is "client.xxx" — extract the login
      logins.push(capsEntity.replace(/^client\./, ""));
    } else {
      // Entire Project: apply to all project members
      logins.push(...projectMembers.map((m) => m.bastion_login));
    }

    if (logins.length === 0) {
      toast.error("No users to apply capabilities to.");
      setShowSpinner(false);
      return;
    }

    setSpinnerMessage(`Applying capabilities to ${logins.length} user(s)...`);
    let ok = 0;
    let fail = 0;
    try {
      const token = await ensureToken();
      for (const login of logins) {
        try {
          await applyUserCaps(token, selectedCluster, {
            user_entity: `client.${login}`,
            template_capabilities: DEFAULT_CAPS_TEMPLATE,
            renders: [
              {
                fs_name: DEFAULT_VOL,
                subvol_name: capsSubvol,
                group_name: capsGroup || undefined,
              },
            ],
            sync_across_clusters: true,
            merge_strategy: "multi",
          });
          ok++;
        } catch (ex) {
          fail++;
          console.error(`Failed to apply caps for client.${login}:`, ex);
        }
      }
      if (fail === 0) {
        toast.success(`Capabilities applied to ${ok} user(s).`);
      } else {
        toast.warning(`Applied to ${ok} user(s), failed for ${fail}.`);
      }
      setCapsEntity("");
      setCapsSubvol("");
      setCapsGroup("");
      loadCephUsers();
    } catch (ex) {
      toast.error(getErrorMessage(ex, "Failed to apply capabilities."));
    } finally {
      setShowSpinner(false);
      setSpinnerMessage("");
    }
  };

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

  const handleExportKeyring = async (entity: string) => {
    try {
      const token = await ensureToken();
      const { data: response } = await exportUserKeyrings(token, selectedCluster, [entity]);
      const keyring = typeof response === "string"
        ? response
        : response.data
          ? typeof response.data === "string"
            ? response.data
            : JSON.stringify(response.data, null, 2)
          : JSON.stringify(response, null, 2);
      await copyToClipboard(keyring);
    } catch (ex) {
      toast.error(getErrorMessage(ex, "Failed to export keyring."));
    }
  };

  const handleDeleteCephUser = async (entity: string) => {
    setShowSpinner(true);
    setSpinnerMessage("Deleting user...");
    try {
      const token = await ensureToken();
      await deleteCephUser(token, selectedCluster, entity);
      toast.success(`User "${entity}" deleted.`);
      loadCephUsers();
    } catch (ex) {
      toast.error(getErrorMessage(ex, "Failed to delete user."));
    } finally {
      setShowSpinner(false);
      setSpinnerMessage("");
    }
  };

  const filteredCephUsers = cephUsers.filter((u) =>
    (u.entity || "").toLowerCase().includes(userSearch.toLowerCase())
  );

  // ----- Normal User: My Credentials -----

  const loadMyCredentials = useCallback(async () => {
    if (!bastionLogin || !selectedCluster) return;
    try {
      const token = await ensureToken();
      const entity = `client.${bastionLogin}`;

      // Export keyring
      try {
        const { data: response } = await exportUserKeyrings(token, selectedCluster, [entity]);
        const keyring = typeof response === "string"
          ? response
          : response.data
            ? typeof response.data === "string"
              ? response.data
              : JSON.stringify(response.data, null, 2)
            : "";
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

  // ===== OPERATOR VIEW =====
  if (isOperator) {
    return (
      <div className="container mx-auto min-h-[80vh] mt-8 mb-8 px-4">
        <h1 className="text-xl font-semibold text-fabric-dark mb-4">
          Storage Management
        </h1>
        {clusterSelector}

        <Tabs defaultValue="subvolumes">
          <TabsList>
            <TabsTrigger value="subvolumes">Subvolumes</TabsTrigger>
            <TabsTrigger value="cephx">CephX Users</TabsTrigger>
          </TabsList>

          {/* ===== SUBVOLUMES TAB ===== */}
          <TabsContent value="subvolumes" className="space-y-4">
            {/* Group selector */}
            <div className="flex items-center gap-3">
              <div>
                <Label htmlFor="group-filter">Group</Label>
                <select
                  id="group-filter"
                  className="flex h-9 w-48 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                >
                  <option value="">All groups</option>
                  {groups.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-5"
                onClick={() => {
                  loadGroups();
                  loadSubvolumes(selectedGroup || undefined);
                }}
              >
                <RefreshCw className="h-4 w-4 mr-1" /> Refresh
              </Button>
            </div>

            {/* Subvolume table */}
            {subvolumes.length > 0 ? (
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Group</TableHead>
                      <TableHead>Quota</TableHead>
                      <TableHead>Used</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subvolumes.map((sv) => (
                      <TableRow key={`${sv.group || ""}-${sv.name}`}>
                        <TableCell className="font-mono text-sm">
                          {sv.name}
                        </TableCell>
                        <TableCell>{sv.group || "—"}</TableCell>
                        <TableCell>{formatBytes(sv.bytes_quota)}</TableCell>
                        <TableCell>{formatBytes(sv.bytes_used)}</TableCell>
                        <TableCell>
                          <Badge
                            className={
                              sv.state === "complete"
                                ? "bg-fabric-success text-white"
                                : "bg-fabric-warning text-white"
                            }
                          >
                            {sv.state || "unknown"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setResizeSubvol(sv);
                                setResizeSizeGiB(
                                  sv.bytes_quota && sv.bytes_quota !== "infinite"
                                    ? Math.ceil(
                                        (typeof sv.bytes_quota === "string"
                                          ? parseInt(sv.bytes_quota)
                                          : sv.bytes_quota) /
                                          (1024 * 1024 * 1024)
                                      )
                                    : 10
                                );
                              }}
                            >
                              Resize
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="border-fabric-danger text-fabric-danger"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    Delete Subvolume
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Delete subvolume &quot;{sv.name}&quot;
                                    {sv.group ? ` from group "${sv.group}"` : ""}
                                    ? This cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteSubvolume(sv)}
                                    className="bg-destructive text-white"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="bg-fabric-primary/10 border border-fabric-primary/30 text-fabric-dark rounded p-4">
                No subvolumes found.
              </div>
            )}

            {/* Resize dialog */}
            {resizeSubvol && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">
                    Resize: {resizeSubvol.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end gap-3">
                    <div>
                      <Label>New Size (GiB)</Label>
                      <Input
                        type="number"
                        min={1}
                        value={resizeSizeGiB}
                        onChange={(e) =>
                          setResizeSizeGiB(parseInt(e.target.value) || 1)
                        }
                        className="w-32"
                      />
                    </div>
                    <Button
                      onClick={handleResizeSubvolume}
                      className="bg-fabric-primary hover:bg-fabric-primary-dark text-white"
                    >
                      Resize
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setResizeSubvol(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Create subvolume form */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Create Subvolume</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={handleCreateSubvolume}
                  className="space-y-3"
                >
                  <div className="flex items-end gap-3">
                    <div>
                      <Label>Scope</Label>
                      <select
                        className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                        value={subvolScope}
                        onChange={(e) => {
                          const scope = e.target.value as "user" | "project";
                          setSubvolScope(scope);
                          setNewSubvolName("");
                          setNewSubvolGroup("");
                        }}
                      >
                        <option value="user">Per-User</option>
                        <option value="project">Per-Project</option>
                      </select>
                    </div>

                    {subvolScope === "user" ? (
                      <div>
                        <Label>User</Label>
                        <select
                          className="flex h-9 w-48 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                          value={newSubvolName}
                          onChange={(e) => setNewSubvolName(e.target.value)}
                        >
                          <option value="">Select user...</option>
                          {projectMembers.map((m) => (
                            <option key={m.uuid} value={m.bastion_login}>
                              {m.bastion_login}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <>
                        <div>
                          <Label>Project</Label>
                          <select
                            className="flex h-9 w-64 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                            value={newSubvolGroup}
                            onChange={(e) => setNewSubvolGroup(e.target.value)}
                          >
                            <option value="">Select project...</option>
                            {projects.map((p) => (
                              <option key={p.uuid} value={p.uuid}>
                                {p.name} ({p.uuid.slice(0, 8)}...)
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <Label>Subvolume Name</Label>
                          <Input
                            placeholder="subvol-name"
                            value={newSubvolName}
                            onChange={(e) => setNewSubvolName(e.target.value)}
                            className="w-48"
                          />
                        </div>
                      </>
                    )}

                    <div>
                      <Label>Size (GiB)</Label>
                      <Input
                        type="number"
                        min={1}
                        value={newSubvolSizeGiB}
                        onChange={(e) =>
                          setNewSubvolSizeGiB(parseInt(e.target.value) || 1)
                        }
                        className="w-24"
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={!newSubvolName || (subvolScope === "project" && !newSubvolGroup)}
                      className="bg-fabric-success hover:bg-fabric-success/90 text-white"
                    >
                      <Plus className="h-4 w-4 mr-1" /> Create
                    </Button>
                  </div>
                  {subvolScope === "user" && (
                    <p className="text-xs text-muted-foreground">
                      Per-User: subvolume name = bastion login, no group.
                    </p>
                  )}
                  {subvolScope === "project" && (
                    <p className="text-xs text-muted-foreground">
                      Per-Project: group = project UUID, provide a subvolume name (e.g. slugified project name).
                    </p>
                  )}
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== CEPHX USERS TAB ===== */}
          <TabsContent value="cephx" className="space-y-4">
            {/* Apply CephX Caps */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  Apply User Capabilities
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={handleApplyCaps}
                  className="space-y-3"
                >
                  <div className="flex items-end gap-3 flex-wrap">
                    <div>
                      <Label>Target</Label>
                      <select
                        className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                        value={capsTarget}
                        onChange={(e) => {
                          setCapsTarget(e.target.value as "user" | "project");
                          setCapsEntity("");
                        }}
                      >
                        <option value="user">Single User</option>
                        <option value="project">Entire Project</option>
                      </select>
                    </div>

                    {capsTarget === "user" && (
                      <div>
                        <Label>User Entity</Label>
                        <select
                          className="flex h-9 w-48 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                          value={capsEntity}
                          onChange={(e) => setCapsEntity(e.target.value)}
                        >
                          <option value="">Select user...</option>
                          {projectMembers.map((m) => (
                            <option key={m.uuid} value={`client.${m.bastion_login}`}>
                              client.{m.bastion_login}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <Label>Subvolume</Label>
                      <select
                        className="flex h-9 w-48 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                        value={capsSubvol}
                        onChange={(e) => {
                          const svName = e.target.value;
                          setCapsSubvol(svName);
                          // Auto-fill group from the selected subvolume
                          const sv = subvolumes.find((s) => s.name === svName);
                          setCapsGroup(sv?.group || "");
                        }}
                      >
                        <option value="">Select subvolume...</option>
                        {subvolumes.map((sv) => (
                          <option key={`${sv.group || ""}-${sv.name}`} value={sv.name}>
                            {sv.name}{sv.group ? ` (${sv.group})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label>Group</Label>
                      <select
                        className="flex h-9 w-40 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                        value={capsGroup}
                        onChange={(e) => setCapsGroup(e.target.value)}
                      >
                        <option value="">None</option>
                        {groups.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button
                      type="submit"
                      disabled={
                        !capsSubvol ||
                        (capsTarget === "user" && !capsEntity) ||
                        (capsTarget === "project" && projectMembers.length === 0)
                      }
                      className="bg-fabric-primary hover:bg-fabric-primary/90 text-white"
                    >
                      Apply Caps
                    </Button>
                  </div>
                  {capsTarget === "user" && (
                    <p className="text-xs text-muted-foreground">
                      Apply default capabilities to a single user for the selected subvolume.
                    </p>
                  )}
                  {capsTarget === "project" && (
                    <p className="text-xs text-muted-foreground">
                      Apply default capabilities to all {projectMembers.length} project member(s) for the selected subvolume.
                    </p>
                  )}
                </form>
              </CardContent>
            </Card>

            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={loadCephUsers}
              >
                <RefreshCw className="h-4 w-4 mr-1" /> Refresh
              </Button>
            </div>

            {filteredCephUsers.length > 0 ? (
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Entity</TableHead>
                      <TableHead>Capabilities</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCephUsers.map((user) => (
                      <TableRow key={user.entity}>
                        <TableCell className="font-mono text-sm">
                          {user.entity}
                        </TableCell>
                        <TableCell className="text-xs max-w-md truncate">
                          {user.caps
                            ? Object.entries(user.caps)
                                .map(([k, v]) => `${k}: ${v}`)
                                .join("; ")
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleExportKeyring(user.entity)}
                            >
                              <KeyRound className="h-3 w-3 mr-1" /> Export
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="border-fabric-danger text-fabric-danger"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    Delete User
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Delete user &quot;{user.entity}&quot;? This
                                    will revoke all access.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() =>
                                      handleDeleteCephUser(user.entity)
                                    }
                                    className="bg-destructive text-white"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="bg-fabric-primary/10 border border-fabric-primary/30 text-fabric-dark rounded p-4">
                {userSearch ? "No matching users." : "No users found."}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  // ===== NORMAL USER VIEW =====
  const currentCluster = clusters.find((c) => c.cluster === selectedCluster);
  const monHost = currentCluster?.mon_host || "";
  const userEntity = `client.${bastionLogin}`;

  return (
    <div className="container mx-auto min-h-[80vh] mt-8 mb-8 px-4">
      <h1 className="text-xl font-semibold text-fabric-dark mb-4">
        My Storage Credentials
      </h1>
      {clusterSelector}

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
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">
                    Mount command
                  </Label>
                  <pre className="bg-muted p-3 rounded text-xs overflow-auto mt-1">
{`sudo mount -t ceph ${monHost}:6789:/ /mnt/ceph \\
  -o name=${bastionLogin},secretfile=/etc/ceph/keyring`}
                  </pre>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-1"
                    onClick={() =>
                      copyToClipboard(
                        `sudo mount -t ceph ${monHost}:6789:/ /mnt/ceph -o name=${bastionLogin},secretfile=/etc/ceph/keyring`
                      )
                    }
                  >
                    <Copy className="h-3 w-3 mr-1" /> Copy
                  </Button>
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
    </div>
  );
}
