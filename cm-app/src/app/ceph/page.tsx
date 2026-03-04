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
import { getPerson } from "@/services/core-api-service";
import { createIdToken } from "@/services/credential-manager-service";
import { getCephStorageProject } from "@/lib/config";
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
  listS3Users,
  createS3User,
  deleteS3User,
  getS3UserKeys,
  createS3Key,
  deleteS3Key,
} from "@/services/ceph-service";
import {
  Copy,
  Download,
  RefreshCw,
  Trash2,
  Plus,
  Search,
  Eye,
  EyeOff,
  KeyRound,
} from "lucide-react";

// Types

interface ClusterInfo {
  name: string;
  fsid: string;
  mon_host: string;
  s3_endpoints?: Record<string, string>;
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

interface S3User {
  user_id: string;
  display_name: string;
  email?: string;
  keys?: Array<{ access_key: string; secret_key: string }>;
  max_buckets?: number;
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

export default function CephPage() {
  const { cmUserStatus } = useUserStatus();

  // Auth & role state
  const [isOperator, setIsOperator] = useState(false);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [cephToken, setCephToken] = useState("");
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

  // CephX users state
  const [cephUsers, setCephUsers] = useState<CephUser[]>([]);
  const [userSearch, setUserSearch] = useState("");

  // S3 users state
  const [s3Users, setS3Users] = useState<S3User[]>([]);
  const [newS3Uid, setNewS3Uid] = useState("");
  const [newS3DisplayName, setNewS3DisplayName] = useState("");
  const [newS3Email, setNewS3Email] = useState("");
  const [expandedS3User, setExpandedS3User] = useState<string | null>(null);
  const [s3UserKeys, setS3UserKeys] = useState<
    Record<string, Array<{ access_key: string; secret_key: string }>>
  >({});

  // Normal user state
  const [myKeyring, setMyKeyring] = useState("");
  const [myS3Keys, setMyS3Keys] = useState<
    Array<{ access_key: string; secret_key: string }>
  >([]);
  const [showSecretKey, setShowSecretKey] = useState<Record<string, boolean>>({});

  // Token management
  const ensureToken = useCallback(async (): Promise<string> => {
    const TOKEN_LIFETIME_MS = 30 * 60 * 1000;
    if (cephToken && Date.now() - tokenCreatedAt < TOKEN_LIFETIME_MS) {
      return cephToken;
    }
    try {
      const projectName = getCephStorageProject();
      // First get the project list to find the project UUID
      const { getProjects } = await import("@/services/core-api-service");
      const userId = localStorage.getItem("cmUserID");
      if (!userId) throw new Error("Not logged in");
      const { data: projRes } = await getProjects(userId);
      const projects = projRes.results || [];
      const storageProject = projects.find(
        (p: { name: string }) => p.name === projectName
      );
      if (!storageProject) {
        // Try creating token with "all" scope on any project
        const activeProject = projects.find((p: { active: boolean }) => p.active);
        if (!activeProject) throw new Error("No active project found");
        const { data: res } = await createIdToken(
          activeProject.uuid,
          "all",
          1,
          "ceph-gui-session"
        );
        const token = res.data[0].token;
        setCephToken(token);
        setTokenCreatedAt(Date.now());
        return token;
      }
      const { data: res } = await createIdToken(
        storageProject.uuid,
        "all",
        1,
        "ceph-gui-session"
      );
      const token = res.data[0].token;
      setCephToken(token);
      setTokenCreatedAt(Date.now());
      return token;
    } catch (ex) {
      const msg = getErrorMessage(ex, "Failed to create Ceph session token.");
      toast.error(msg);
      throw ex;
    }
  }, [cephToken, tokenCreatedAt]);

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
        const { data } = await getClusterInfo(token);
        const clusterList: ClusterInfo[] = Array.isArray(data)
          ? data
          : data.data
            ? Array.isArray(data.data)
              ? data.data
              : Object.entries(data.data).map(([name, info]) => ({
                  name,
                  ...(info as object),
                }))
            : [];
        setClusters(clusterList);
        if (clusterList.length > 0 && !selectedCluster) {
          setSelectedCluster(clusterList[0].name);
        }
      } catch {
        // token error already toasted
      }
    }
    loadClusters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleLoaded, cmUserStatus]);

  // Load data when cluster changes
  useEffect(() => {
    if (!selectedCluster || !roleLoaded) return;
    if (isOperator) {
      loadGroups();
      loadCephUsers();
      loadS3Users();
    } else {
      loadMyCredentials();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCluster, roleLoaded, isOperator]);

  // ----- Operator: Subvolumes -----

  const loadGroups = useCallback(async () => {
    try {
      const token = await ensureToken();
      const { data } = await listSubvolumeGroups(token, selectedCluster, DEFAULT_VOL);
      const groupList: string[] = Array.isArray(data) ? data : data.data || [];
      setGroups(groupList);
    } catch (ex) {
      toast.error(getErrorMessage(ex, "Failed to load subvolume groups."));
    }
  }, [selectedCluster, ensureToken]);

  const loadSubvolumes = useCallback(
    async (group?: string) => {
      try {
        const token = await ensureToken();
        const { data } = await listSubvolumes(
          token,
          selectedCluster,
          DEFAULT_VOL,
          group || undefined,
          true
        );
        const svList: SubvolumeInfo[] = Array.isArray(data) ? data : data.data || [];
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
      await createOrResizeSubvolume(token, selectedCluster, DEFAULT_VOL, {
        subvol_name: newSubvolName,
        group_name: newSubvolGroup || undefined,
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

  // Apply CephX caps
  const handleApplyCaps = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!capsEntity || !capsSubvol) return;
    setShowSpinner(true);
    setSpinnerMessage("Applying CephX capabilities...");
    try {
      const token = await ensureToken();
      await applyUserCaps(token, selectedCluster, {
        user_entity: capsEntity,
        template_capabilities: DEFAULT_CAPS_TEMPLATE,
        renders: [
          {
            fs_name: DEFAULT_VOL,
            subvol_name: capsSubvol,
            group_name: capsGroup || "default",
          },
        ],
        sync_across_clusters: true,
        merge_strategy: "multi",
      });
      toast.success(`Capabilities applied to "${capsEntity}".`);
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
      const { data } = await listCephUsers(token, selectedCluster);
      const users: CephUser[] = Array.isArray(data) ? data : data.data || [];
      setCephUsers(users);
    } catch (ex) {
      toast.error(getErrorMessage(ex, "Failed to load CephX users."));
    }
  }, [selectedCluster, ensureToken]);

  const handleExportKeyring = async (entity: string) => {
    try {
      const token = await ensureToken();
      const { data } = await exportUserKeyrings(token, selectedCluster, [entity]);
      const keyring = typeof data === "string" ? data : data.data || JSON.stringify(data, null, 2);
      await copyToClipboard(keyring);
    } catch (ex) {
      toast.error(getErrorMessage(ex, "Failed to export keyring."));
    }
  };

  const handleDeleteCephUser = async (entity: string) => {
    setShowSpinner(true);
    setSpinnerMessage("Deleting CephX user...");
    try {
      const token = await ensureToken();
      await deleteCephUser(token, selectedCluster, entity);
      toast.success(`User "${entity}" deleted.`);
      loadCephUsers();
    } catch (ex) {
      toast.error(getErrorMessage(ex, "Failed to delete CephX user."));
    } finally {
      setShowSpinner(false);
      setSpinnerMessage("");
    }
  };

  const filteredCephUsers = cephUsers.filter((u) =>
    u.entity.toLowerCase().includes(userSearch.toLowerCase())
  );

  // ----- Operator: S3 Users -----

  const loadS3Users = useCallback(async () => {
    try {
      const token = await ensureToken();
      const { data } = await listS3Users(token, selectedCluster);
      const users: S3User[] = Array.isArray(data) ? data : data.data || [];
      setS3Users(users);
    } catch (ex) {
      toast.error(getErrorMessage(ex, "Failed to load S3 users."));
    }
  }, [selectedCluster, ensureToken]);

  const handleCreateS3User = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newS3Uid || !newS3DisplayName) return;
    setShowSpinner(true);
    setSpinnerMessage("Creating S3 user...");
    try {
      const token = await ensureToken();
      await createS3User(token, selectedCluster, {
        uid: newS3Uid,
        display_name: newS3DisplayName,
        email: newS3Email || undefined,
      });
      toast.success(`S3 user "${newS3Uid}" created.`);
      setNewS3Uid("");
      setNewS3DisplayName("");
      setNewS3Email("");
      loadS3Users();
    } catch (ex) {
      toast.error(getErrorMessage(ex, "Failed to create S3 user."));
    } finally {
      setShowSpinner(false);
      setSpinnerMessage("");
    }
  };

  const handleDeleteS3User = async (uid: string) => {
    setShowSpinner(true);
    setSpinnerMessage("Deleting S3 user...");
    try {
      const token = await ensureToken();
      await deleteS3User(token, selectedCluster, uid);
      toast.success(`S3 user "${uid}" deleted.`);
      loadS3Users();
    } catch (ex) {
      toast.error(getErrorMessage(ex, "Failed to delete S3 user."));
    } finally {
      setShowSpinner(false);
      setSpinnerMessage("");
    }
  };

  const handleLoadS3Keys = async (uid: string) => {
    if (expandedS3User === uid) {
      setExpandedS3User(null);
      return;
    }
    try {
      const token = await ensureToken();
      const { data } = await getS3UserKeys(token, selectedCluster, uid);
      const keys = Array.isArray(data) ? data : data.data || [];
      setS3UserKeys((prev) => ({ ...prev, [uid]: keys }));
      setExpandedS3User(uid);
    } catch (ex) {
      toast.error(getErrorMessage(ex, "Failed to load S3 keys."));
    }
  };

  const handleCreateS3Key = async (uid: string) => {
    try {
      const token = await ensureToken();
      await createS3Key(token, selectedCluster, uid);
      toast.success("S3 key created.");
      // Reload keys
      const { data } = await getS3UserKeys(token, selectedCluster, uid);
      const keys = Array.isArray(data) ? data : data.data || [];
      setS3UserKeys((prev) => ({ ...prev, [uid]: keys }));
    } catch (ex) {
      toast.error(getErrorMessage(ex, "Failed to create S3 key."));
    }
  };

  const handleDeleteS3Key = async (uid: string, accessKey: string) => {
    try {
      const token = await ensureToken();
      await deleteS3Key(token, selectedCluster, uid, accessKey);
      toast.success("S3 key deleted.");
      const { data } = await getS3UserKeys(token, selectedCluster, uid);
      const keys = Array.isArray(data) ? data : data.data || [];
      setS3UserKeys((prev) => ({ ...prev, [uid]: keys }));
    } catch (ex) {
      toast.error(getErrorMessage(ex, "Failed to delete S3 key."));
    }
  };

  // ----- Normal User: My Credentials -----

  const loadMyCredentials = useCallback(async () => {
    if (!bastionLogin || !selectedCluster) return;
    try {
      const token = await ensureToken();
      const entity = `client.${bastionLogin}`;

      // Export keyring
      try {
        const { data } = await exportUserKeyrings(token, selectedCluster, [entity]);
        const keyring = typeof data === "string" ? data : data.data || "";
        setMyKeyring(keyring);
      } catch {
        setMyKeyring("");
      }

      // Load S3 keys
      try {
        const { data } = await getS3UserKeys(token, selectedCluster, bastionLogin);
        const keys = Array.isArray(data) ? data : data.data || [];
        setMyS3Keys(keys);
      } catch {
        setMyS3Keys([]);
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
            Please log in to access Ceph Storage management.
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
                <option key={c.name} value={c.name}>
                  {c.name}
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
          Ceph Storage Management
        </h1>
        {clusterSelector}

        <Tabs defaultValue="subvolumes">
          <TabsList>
            <TabsTrigger value="subvolumes">Subvolumes</TabsTrigger>
            <TabsTrigger value="cephx">CephX Users</TabsTrigger>
            <TabsTrigger value="s3">S3 Users</TabsTrigger>
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
                  className="flex items-end gap-3"
                >
                  <div>
                    <Label>Name</Label>
                    <Input
                      placeholder="subvol-name"
                      value={newSubvolName}
                      onChange={(e) => setNewSubvolName(e.target.value)}
                      className="w-48"
                    />
                  </div>
                  <div>
                    <Label>Group</Label>
                    <select
                      className="flex h-9 w-48 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                      value={newSubvolGroup}
                      onChange={(e) => setNewSubvolGroup(e.target.value)}
                    >
                      <option value="">default</option>
                      {groups.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>
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
                    disabled={!newSubvolName}
                    className="bg-fabric-success hover:bg-fabric-success/90 text-white"
                  >
                    <Plus className="h-4 w-4 mr-1" /> Create
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Apply CephX Caps */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  Apply CephX Capabilities
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={handleApplyCaps}
                  className="flex items-end gap-3"
                >
                  <div>
                    <Label>User Entity</Label>
                    <Input
                      placeholder="client.username"
                      value={capsEntity}
                      onChange={(e) => setCapsEntity(e.target.value)}
                      className="w-48"
                    />
                  </div>
                  <div>
                    <Label>Subvolume</Label>
                    <Input
                      placeholder="subvol-name"
                      value={capsSubvol}
                      onChange={(e) => setCapsSubvol(e.target.value)}
                      className="w-48"
                    />
                  </div>
                  <div>
                    <Label>Group</Label>
                    <select
                      className="flex h-9 w-40 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                      value={capsGroup}
                      onChange={(e) => setCapsGroup(e.target.value)}
                    >
                      <option value="">default</option>
                      {groups.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    type="submit"
                    disabled={!capsEntity || !capsSubvol}
                    className="bg-fabric-primary hover:bg-fabric-primary/90 text-white"
                  >
                    Apply Caps
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== CEPHX USERS TAB ===== */}
          <TabsContent value="cephx" className="space-y-4">
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
                                    Delete CephX User
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
                {userSearch ? "No matching users." : "No CephX users found."}
              </div>
            )}
          </TabsContent>

          {/* ===== S3 USERS TAB ===== */}
          <TabsContent value="s3" className="space-y-4">
            {/* Create S3 User form */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Create S3 User</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={handleCreateS3User}
                  className="flex items-end gap-3"
                >
                  <div>
                    <Label>UID</Label>
                    <Input
                      placeholder="username"
                      value={newS3Uid}
                      onChange={(e) => setNewS3Uid(e.target.value)}
                      className="w-40"
                    />
                  </div>
                  <div>
                    <Label>Display Name</Label>
                    <Input
                      placeholder="Full Name"
                      value={newS3DisplayName}
                      onChange={(e) => setNewS3DisplayName(e.target.value)}
                      className="w-48"
                    />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input
                      placeholder="user@example.com"
                      value={newS3Email}
                      onChange={(e) => setNewS3Email(e.target.value)}
                      className="w-48"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={!newS3Uid || !newS3DisplayName}
                    className="bg-fabric-success hover:bg-fabric-success/90 text-white"
                  >
                    <Plus className="h-4 w-4 mr-1" /> Create
                  </Button>
                </form>
              </CardContent>
            </Card>

            <div className="flex items-center gap-3 mb-2">
              <Button variant="outline" size="sm" onClick={loadS3Users}>
                <RefreshCw className="h-4 w-4 mr-1" /> Refresh
              </Button>
            </div>

            {s3Users.length > 0 ? (
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>UID</TableHead>
                      <TableHead>Display Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Max Buckets</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {s3Users.map((user) => (
                      <>
                        <TableRow key={user.user_id}>
                          <TableCell className="font-mono text-sm">
                            {user.user_id}
                          </TableCell>
                          <TableCell>{user.display_name}</TableCell>
                          <TableCell>{user.email || "—"}</TableCell>
                          <TableCell>{user.max_buckets ?? "—"}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleLoadS3Keys(user.user_id)}
                              >
                                <KeyRound className="h-3 w-3 mr-1" />
                                {expandedS3User === user.user_id
                                  ? "Hide Keys"
                                  : "Keys"}
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
                                      Delete S3 User
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Delete S3 user &quot;{user.user_id}&quot;?
                                      All keys and buckets will be removed.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() =>
                                        handleDeleteS3User(user.user_id)
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
                        {expandedS3User === user.user_id && (
                          <TableRow key={`${user.user_id}-keys`}>
                            <TableCell colSpan={5}>
                              <div className="bg-muted/50 p-3 rounded">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-sm font-medium">
                                    Access Keys
                                  </span>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      handleCreateS3Key(user.user_id)
                                    }
                                  >
                                    <Plus className="h-3 w-3 mr-1" /> New Key
                                  </Button>
                                </div>
                                {(s3UserKeys[user.user_id] || []).length > 0 ? (
                                  <div className="space-y-2">
                                    {(s3UserKeys[user.user_id] || []).map(
                                      (key) => (
                                        <div
                                          key={key.access_key}
                                          className="flex items-center gap-2 text-xs font-mono bg-background p-2 rounded border"
                                        >
                                          <span className="truncate max-w-[200px]">
                                            {key.access_key}
                                          </span>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() =>
                                              copyToClipboard(key.access_key)
                                            }
                                          >
                                            <Copy className="h-3 w-3" />
                                          </Button>
                                          <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-fabric-danger"
                                              >
                                                <Trash2 className="h-3 w-3" />
                                              </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                              <AlertDialogHeader>
                                                <AlertDialogTitle>
                                                  Delete Key
                                                </AlertDialogTitle>
                                                <AlertDialogDescription>
                                                  Delete access key &quot;
                                                  {key.access_key.substring(
                                                    0,
                                                    8
                                                  )}
                                                  ...&quot;?
                                                </AlertDialogDescription>
                                              </AlertDialogHeader>
                                              <AlertDialogFooter>
                                                <AlertDialogCancel>
                                                  Cancel
                                                </AlertDialogCancel>
                                                <AlertDialogAction
                                                  onClick={() =>
                                                    handleDeleteS3Key(
                                                      user.user_id,
                                                      key.access_key
                                                    )
                                                  }
                                                  className="bg-destructive text-white"
                                                >
                                                  Delete
                                                </AlertDialogAction>
                                              </AlertDialogFooter>
                                            </AlertDialogContent>
                                          </AlertDialog>
                                        </div>
                                      )
                                    )}
                                  </div>
                                ) : (
                                  <div className="text-sm text-muted-foreground">
                                    No keys found.
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="bg-fabric-primary/10 border border-fabric-primary/30 text-fabric-dark rounded p-4">
                No S3 users found.
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  // ===== NORMAL USER VIEW =====
  const currentCluster = clusters.find((c) => c.name === selectedCluster);
  const monHost = currentCluster?.mon_host || "";
  const s3Endpoints = currentCluster?.s3_endpoints || {};
  const userEntity = `client.${bastionLogin}`;

  return (
    <div className="container mx-auto min-h-[80vh] mt-8 mb-8 px-4">
      <h1 className="text-xl font-semibold text-fabric-dark mb-4">
        My Ceph Storage Credentials
      </h1>
      {clusterSelector}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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

        {/* S3 Credentials */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">My S3 Credentials</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm">
              <span className="text-muted-foreground">Cluster: </span>
              <Badge className="bg-fabric-success text-white">
                {selectedCluster}
              </Badge>
            </div>

            {myS3Keys.length > 0 ? (
              <>
                {myS3Keys.map((key) => (
                  <div
                    key={key.access_key}
                    className="border rounded p-3 space-y-2"
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Access Key:</span>
                      <span className="font-mono text-xs">
                        {key.access_key}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(key.access_key)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Secret Key:</span>
                      <span className="font-mono text-xs">
                        {showSecretKey[key.access_key]
                          ? key.secret_key
                          : "••••••••••••••••"}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setShowSecretKey((prev) => ({
                            ...prev,
                            [key.access_key]: !prev[key.access_key],
                          }))
                        }
                      >
                        {showSecretKey[key.access_key] ? (
                          <EyeOff className="h-3 w-3" />
                        ) : (
                          <Eye className="h-3 w-3" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(key.secret_key)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}

                {Object.keys(s3Endpoints).length > 0 && (
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      S3 Endpoints
                    </Label>
                    <div className="bg-muted p-3 rounded text-xs mt-1 space-y-1">
                      {Object.entries(s3Endpoints).map(([site, url]) => (
                        <div key={site}>
                          <span className="font-medium">{site}:</span> {url}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const firstKey = myS3Keys[0];
                    const endpointUrl =
                      Object.values(s3Endpoints)[0] || "http://localhost:8080";
                    const config = `[default]
aws_access_key_id = ${firstKey.access_key}
aws_secret_access_key = ${firstKey.secret_key}
endpoint_url = ${endpointUrl}
`;
                    downloadFile("s3-credentials.conf", config);
                  }}
                >
                  <Download className="h-3 w-3 mr-1" /> Download boto3 Config
                </Button>
              </>
            ) : (
              <div className="bg-fabric-warning/10 border border-fabric-warning/30 text-fabric-dark rounded p-3 text-sm">
                No S3 credentials found for your account on this cluster.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
