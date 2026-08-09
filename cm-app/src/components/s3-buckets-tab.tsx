"use client";

/**
 * S3 Buckets tab for the Storage page.
 *
 * Authorization mirrors the Ceph Manager API exactly — the UI only hides what
 * the server would refuse anyway:
 *
 *   - Facility admins and owners of the "Service - FABRIC Ceph" project
 *     ("operators") may create and delete buckets, and see every bucket.
 *   - Everyone else sees only the buckets they own. The server pins a
 *     non-operator's listing to their own uid regardless of what is requested,
 *     so this is defence in depth, not the control itself.
 *
 * An S3 uid is the user's bastion login, the same identity used for CephFS
 * subvolumes.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createS3Bucket,
  createS3Key,
  createS3User,
  deleteS3Bucket,
  deleteS3User,
  getS3UserKeys,
  listS3Buckets,
  listS3Users,
  setS3BucketQuota,
} from "@/services/storage-service";

/** GiB → KiB, the unit the quota API speaks. */
const GIB_TO_KIB = 1024 * 1024;

export interface S3Bucket {
  name: string;
  owner?: string;
  num_objects?: number;
  size_kb?: number;
  placement_rule?: string;
  zonegroup?: string;
  zone?: string;
  versioning?: string;
}

interface S3KeyPair {
  user?: string;
  access_key?: string;
  secret_key?: string | null;
  status?: string;
}

export interface S3User {
  uid: string;
  display_name?: string;
  email?: string | null;
  max_buckets?: number;
  suspended?: boolean;
}

interface ProjectMember {
  uuid: string;
  bastion_login: string;
  membership_types: string[];
}

interface Props {
  cluster: string;
  /** RGW S3 endpoints for `cluster`, from /cluster/info. */
  s3Endpoints: string[];
  /** Facility admin or owner of the FABRIC Ceph service project. */
  isOperator: boolean;
  /** The caller's bastion login, which is their S3 uid. */
  bastionLogin: string;
  /** Service-project members; their bastion logins are the S3 uids to provision. */
  projectMembers: ProjectMember[];
  ensureToken: () => Promise<string>;
  getErrorMessage: (ex: unknown, fallback: string) => string;
}

function formatSize(sizeKb?: number): string {
  if (sizeKb === undefined || sizeKb === null) return "—";
  if (sizeKb < 1024) return `${sizeKb} KiB`;
  if (sizeKb < 1024 * 1024) return `${(sizeKb / 1024).toFixed(1)} MiB`;
  return `${(sizeKb / 1024 / 1024).toFixed(2)} GiB`;
}

// Bucket names must be DNS-compatible; RGW rejects anything else.
const BUCKET_NAME_RE = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

export function S3BucketsTab({
  cluster,
  s3Endpoints,
  isOperator,
  bastionLogin,
  projectMembers,
  ensureToken,
  getErrorMessage,
}: Props) {
  const [buckets, setBuckets] = useState<S3Bucket[]>([]);
  const [loading, setLoading] = useState(false);

  // S3 user management (operators only)
  const [s3Users, setS3Users] = useState<S3User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedLogins, setSelectedLogins] = useState<string[]>([]);
  const [provisioning, setProvisioning] = useState(false);
  const [deleteUserTarget, setDeleteUserTarget] = useState<S3User | null>(null);
  const [purgeUserData, setPurgeUserData] = useState(false);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newBucket, setNewBucket] = useState("");
  const [newOwner, setNewOwner] = useState("");
  const [newVersioning, setNewVersioning] = useState<"Disabled" | "Enabled">("Disabled");
  const [newSizeGib, setNewSizeGib] = useState("");
  const [newMaxObjects, setNewMaxObjects] = useState("");
  const [creating, setCreating] = useState(false);

  // Quota dialog for an existing bucket
  const [quotaTarget, setQuotaTarget] = useState<S3Bucket | null>(null);
  const [quotaSizeGib, setQuotaSizeGib] = useState("");
  const [quotaMaxObjects, setQuotaMaxObjects] = useState("");
  const [savingQuota, setSavingQuota] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<S3Bucket | null>(null);
  const [purgeObjects, setPurgeObjects] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Credentials dialog
  const [credsOpen, setCredsOpen] = useState(false);
  const [creds, setCreds] = useState<S3KeyPair | null>(null);
  const [credsLoading, setCredsLoading] = useState(false);
  const [existingKeys, setExistingKeys] = useState<S3KeyPair[]>([]);

  const endpoint = s3Endpoints?.[0] || "";

  const loadBuckets = useCallback(async () => {
    if (!cluster) return;
    setLoading(true);
    try {
      const token = await ensureToken();
      // Operators may list everything; everyone else is scoped to themselves.
      // The server enforces this too — passing uid here just keeps the request
      // honest about what is being asked for.
      const { data } = await listS3Buckets(
        token,
        cluster,
        isOperator ? undefined : bastionLogin
      );
      setBuckets(Array.isArray(data?.data) ? data.data : []);
    } catch (ex) {
      toast.error(getErrorMessage(ex, "Failed to load S3 buckets."));
      setBuckets([]);
    } finally {
      setLoading(false);
    }
  }, [cluster, isOperator, bastionLogin, ensureToken, getErrorMessage]);

  const loadS3Users = useCallback(async () => {
    if (!cluster || !isOperator) return;
    setUsersLoading(true);
    try {
      const token = await ensureToken();
      const { data } = await listS3Users(token, cluster);
      setS3Users(Array.isArray(data?.data) ? data.data : []);
    } catch (ex) {
      toast.error(getErrorMessage(ex, "Failed to load S3 users."));
      setS3Users([]);
    } finally {
      setUsersLoading(false);
    }
  }, [cluster, isOperator, ensureToken, getErrorMessage]);

  useEffect(() => {
    loadBuckets();
  }, [loadBuckets]);

  useEffect(() => {
    loadS3Users();
  }, [loadS3Users]);

  const existingUids = new Set(s3Users.map((u) => u.uid?.toLowerCase()));

  // Project members who do not yet have an S3 account on this cluster.
  const provisionableMembers = projectMembers.filter(
    (m) =>
      m.bastion_login &&
      !existingUids.has(m.bastion_login.toLowerCase()) &&
      m.bastion_login.toLowerCase().includes(memberSearch.trim().toLowerCase())
  );

  function toggleLogin(login: string) {
    setSelectedLogins((prev) =>
      prev.includes(login) ? prev.filter((l) => l !== login) : [...prev, login]
    );
  }

  async function handleProvisionUsers() {
    if (selectedLogins.length === 0) {
      toast.error("Select at least one project member.");
      return;
    }
    setProvisioning(true);
    try {
      const token = await ensureToken();
      // Provision one at a time so a single failure does not hide the rest;
      // the endpoint is an upsert, so re-running is safe.
      const failed: string[] = [];
      for (const login of selectedLogins) {
        try {
          await createS3User(token, cluster, {
            uid: login,
            display_name: login,
          });
        } catch (ex) {
          failed.push(login);
          console.error(`createS3User failed for ${login}`, ex);
        }
      }
      const ok = selectedLogins.length - failed.length;
      if (ok > 0) toast.success(`Created ${ok} S3 user(s) on ${cluster}.`);
      if (failed.length > 0) {
        toast.error(`Failed for: ${failed.join(", ")}`);
      }
      setSelectedLogins([]);
      await loadS3Users();
    } finally {
      setProvisioning(false);
    }
  }

  async function handleDeleteUser() {
    if (!deleteUserTarget) return;
    try {
      const token = await ensureToken();
      await deleteS3User(token, cluster, deleteUserTarget.uid, purgeUserData);
      toast.success(`S3 user "${deleteUserTarget.uid}" deleted.`);
      setDeleteUserTarget(null);
      setPurgeUserData(false);
      await loadS3Users();
      await loadBuckets();
    } catch (ex) {
      toast.error(getErrorMessage(ex, "Failed to delete S3 user."));
    }
  }

  async function handleCreate() {
    const name = newBucket.trim().toLowerCase();
    const owner = newOwner.trim();
    if (!BUCKET_NAME_RE.test(name)) {
      toast.error(
        "Bucket name must be 3–63 characters, lowercase letters, digits, dots or hyphens, and start and end with a letter or digit."
      );
      return;
    }
    if (!owner) {
      toast.error("Owner uid is required (a user's bastion login).");
      return;
    }
    // Validate the quota before creating anything: a bad value thrown after
    // the create would be reported as "create failed" for a bucket that exists.
    let quota;
    try {
      quota = buildQuota(newSizeGib, newMaxObjects);
    } catch (ex) {
      toast.error(ex instanceof Error ? ex.message : String(ex));
      return;
    }
    setCreating(true);
    try {
      const token = await ensureToken();
      await createS3Bucket(token, cluster, {
        bucket: name,
        uid: owner,
        versioning: newVersioning,
      });
      // Quota is a separate call; the bucket exists either way, so a failure
      // here is reported without claiming the create failed.
      if (quota) {
        try {
          await setS3BucketQuota(token, cluster, name, quota);
        } catch (ex) {
          toast.error(
            getErrorMessage(ex, `Bucket "${name}" was created, but its quota could not be set.`)
          );
        }
      }
      toast.success(`Bucket "${name}" created for ${owner}.`);
      setCreateOpen(false);
      setNewBucket("");
      setNewOwner("");
      setNewVersioning("Disabled");
      setNewSizeGib("");
      setNewMaxObjects("");
      await loadBuckets();
    } catch (ex) {
      toast.error(getErrorMessage(ex, "Failed to create bucket."));
    } finally {
      setCreating(false);
    }
  }

  /**
   * Build a quota payload from the form, or null when both fields are blank.
   * Blank means "no limit", which is expressed by disabling the quota rather
   * than sending a zero.
   */
  function buildQuota(sizeGib: string, maxObjects: string) {
    const size = sizeGib.trim();
    const objs = maxObjects.trim();
    if (!size && !objs) return null;
    const payload: {
      enabled: boolean;
      max_size_kb?: number;
      max_objects?: number;
    } = { enabled: true };
    if (size) {
      const n = Number(size);
      if (!Number.isFinite(n) || n <= 0) throw new Error("Max size must be a positive number of GiB.");
      payload.max_size_kb = Math.round(n * GIB_TO_KIB);
    }
    if (objs) {
      const n = Number(objs);
      if (!Number.isInteger(n) || n <= 0) throw new Error("Max objects must be a positive whole number.");
      payload.max_objects = n;
    }
    return payload;
  }

  async function handleSaveQuota() {
    if (!quotaTarget) return;
    setSavingQuota(true);
    try {
      const token = await ensureToken();
      const quota =
        buildQuota(quotaSizeGib, quotaMaxObjects) ??
        // Both blank: explicitly lift the limit.
        { enabled: false };
      await setS3BucketQuota(token, cluster, quotaTarget.name, quota);
      toast.success(
        quota.enabled
          ? `Quota updated for "${quotaTarget.name}".`
          : `Quota removed from "${quotaTarget.name}".`
      );
      setQuotaTarget(null);
      await loadBuckets();
    } catch (ex) {
      toast.error(getErrorMessage(ex, "Failed to set bucket quota."));
    } finally {
      setSavingQuota(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const token = await ensureToken();
      await deleteS3Bucket(token, cluster, deleteTarget.name, purgeObjects);
      toast.success(`Bucket "${deleteTarget.name}" deleted.`);
      setDeleteTarget(null);
      setPurgeObjects(false);
      await loadBuckets();
    } catch (ex) {
      toast.error(getErrorMessage(ex, "Failed to delete bucket."));
    } finally {
      setDeleting(false);
    }
  }

  async function openCredentials() {
    setCredsOpen(true);
    setCreds(null);
    setCredsLoading(true);
    try {
      const token = await ensureToken();
      // Ask for the secret so an existing credential can be shown as-is.
      // Without this the dialog could only ever mint a new key, so every visit
      // would leave another key behind on the account.
      const { data } = await getS3UserKeys(token, cluster, bastionLogin, true);
      const keys: S3KeyPair[] = Array.isArray(data) ? data : [];
      setExistingKeys(keys);
      const usable = keys.find((k) => k.access_key && k.secret_key);
      if (usable) setCreds(usable);
    } catch {
      // Usually means the S3 user does not exist yet; generating creates it.
      setExistingKeys([]);
    } finally {
      setCredsLoading(false);
    }
  }

  async function generateKey() {
    setCredsLoading(true);
    try {
      const token = await ensureToken();
      const { data } = await createS3Key(token, cluster, bastionLogin);
      setCreds(data);
      toast.success("Access key created. Copy the secret now — it is not shown again.");
    } catch (ex) {
      toast.error(getErrorMessage(ex, "Failed to create access key."));
    } finally {
      setCredsLoading(false);
    }
  }

  function copy(text: string, what: string) {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${what} copied.`),
      () => toast.error("Copy failed.")
    );
  }

  const awsSnippet = creds
    ? `export AWS_ACCESS_KEY_ID=${creds.access_key}
export AWS_SECRET_ACCESS_KEY=${creds.secret_key}
export AWS_DEFAULT_REGION=us-east-1

aws --endpoint-url ${endpoint} s3 ls
aws --endpoint-url ${endpoint} s3 cp ./file s3://<bucket>/file
aws --endpoint-url ${endpoint} s3 cp s3://<bucket>/file ./file`
    : "";

  const boto3Snippet = creds
    ? `import boto3
s3 = boto3.client(
    "s3",
    endpoint_url="${endpoint}",
    aws_access_key_id="${creds.access_key}",
    aws_secret_access_key="${creds.secret_key}",
    region_name="us-east-1",
)
s3.upload_file("./file", "<bucket>", "file")`
    : "";

  const s3cmdSnippet = creds
    ? `[default]
access_key = ${creds.access_key}
secret_key = ${creds.secret_key}
host_base = ${endpoint.replace(/^https?:\/\//, "")}
host_bucket = ${endpoint.replace(/^https?:\/\//, "")}/%(bucket)
use_https = ${endpoint.startsWith("https://") ? "True" : "False"}`
    : "";

  // Operators get bucket and user management side by side, mirroring the POSIX
  // side's Subvolumes / CephX Users split. Regular users only ever see their
  // own buckets, so the extra tab would be empty for them.
  const bucketsPanel = (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-muted-foreground">
          {isOperator ? (
            <>
              Showing <strong>all buckets</strong> on <strong>{cluster}</strong>.
            </>
          ) : (
            <>
              Showing buckets owned by <strong>{bastionLogin || "you"}</strong> on{" "}
              <strong>{cluster}</strong>.
            </>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadBuckets} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
          <Button variant="outline" size="sm" onClick={openCredentials}>
            Get S3 Credentials
          </Button>
          {isOperator && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              Create Bucket
            </Button>
          )}
        </div>
      </div>

      {!isOperator && (
        <p className="text-xs text-muted-foreground">
          Creating and deleting buckets is restricted to facility administrators
          and owners of the FABRIC Ceph service project. You can read and write
          objects in your own buckets using the credentials above.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Buckets</CardTitle>
          <CardDescription>
            Object data is transferred directly between your client and the Ceph
            RGW gateway; it does not pass through this portal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead className="text-right">Objects</TableHead>
                <TableHead className="text-right">Size</TableHead>
                <TableHead>Versioning</TableHead>
                {isOperator && <TableHead className="w-40">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {buckets.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={isOperator ? 6 : 5}
                    className="text-center text-sm text-muted-foreground py-6"
                  >
                    {loading ? "Loading…" : "No buckets found."}
                  </TableCell>
                </TableRow>
              )}
              {buckets.map((b) => (
                <TableRow key={b.name}>
                  <TableCell className="font-mono text-xs">{b.name}</TableCell>
                  <TableCell className="font-mono text-xs">{b.owner || "—"}</TableCell>
                  <TableCell className="text-right">{b.num_objects ?? "—"}</TableCell>
                  <TableCell className="text-right">{formatSize(b.size_kb)}</TableCell>
                  <TableCell>
                    <Badge variant={b.versioning === "Enabled" ? "default" : "secondary"}>
                      {b.versioning || "Disabled"}
                    </Badge>
                  </TableCell>
                  {isOperator && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setQuotaTarget(b);
                            setQuotaSizeGib("");
                            setQuotaMaxObjects("");
                          }}
                        >
                          Quota
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            setDeleteTarget(b);
                            setPurgeObjects(false);
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ===== Create bucket (operators only) ===== */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create S3 Bucket</DialogTitle>
            <DialogDescription>
              The owner must already exist as an S3 user. Their uid is their
              bastion login.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="bucket-name">Bucket name</Label>
              <Input
                id="bucket-name"
                value={newBucket}
                placeholder="my-project-data"
                onChange={(e) => setNewBucket(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                3–63 chars: lowercase letters, digits, dots, hyphens.
              </p>
            </div>
            <div>
              <Label htmlFor="bucket-owner">Owner (existing S3 user)</Label>
              <select
                id="bucket-owner"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                value={newOwner}
                onChange={(e) => setNewOwner(e.target.value)}
              >
                <option value="">Select a user…</option>
                {s3Users.map((u) => (
                  <option key={u.uid} value={u.uid}>
                    {u.uid}
                    {u.display_name && u.display_name !== u.uid
                      ? ` (${u.display_name})`
                      : ""}
                  </option>
                ))}
              </select>
              {s3Users.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  No S3 users on this cluster yet. Create them from the{" "}
                  <strong>S3 Users</strong> tab first — a bucket must belong to
                  an existing user.
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="bucket-versioning">Versioning</Label>
              <select
                id="bucket-versioning"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                value={newVersioning}
                onChange={(e) =>
                  setNewVersioning(e.target.value as "Disabled" | "Enabled")
                }
              >
                <option value="Disabled">Disabled</option>
                <option value="Enabled">Enabled</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="bucket-size">Max size (GiB)</Label>
                <Input
                  id="bucket-size"
                  type="number"
                  min="0"
                  step="any"
                  value={newSizeGib}
                  placeholder="unlimited"
                  onChange={(e) => setNewSizeGib(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="bucket-objects">Max objects</Label>
                <Input
                  id="bucket-objects"
                  type="number"
                  min="0"
                  step="1"
                  value={newMaxObjects}
                  placeholder="unlimited"
                  onChange={(e) => setNewMaxObjects(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Leave blank for no limit. Quotas can be changed later from the
              bucket&apos;s Quota action.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Bucket quota ===== */}
      <Dialog
        open={!!quotaTarget}
        onOpenChange={(open) => !open && setQuotaTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quota — {quotaTarget?.name}</DialogTitle>
            <DialogDescription>
              Caps this one bucket. Currently using{" "}
              {formatSize(quotaTarget?.size_kb)} across{" "}
              {quotaTarget?.num_objects ?? 0} object(s).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="quota-size">Max size (GiB)</Label>
                <Input
                  id="quota-size"
                  type="number"
                  min="0"
                  step="any"
                  value={quotaSizeGib}
                  placeholder="unlimited"
                  onChange={(e) => setQuotaSizeGib(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="quota-objects">Max objects</Label>
                <Input
                  id="quota-objects"
                  type="number"
                  min="0"
                  step="1"
                  value={quotaMaxObjects}
                  placeholder="unlimited"
                  onChange={(e) => setQuotaMaxObjects(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Leaving both blank removes the quota entirely. Writes that would
              exceed a quota are rejected by the gateway.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuotaTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveQuota} disabled={savingQuota}>
              {savingQuota ? "Saving…" : "Save quota"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Delete confirmation ===== */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete bucket “{deleteTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. A bucket that still contains objects will
              not be deleted unless you also purge its contents.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {(deleteTarget?.num_objects ?? 0) > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={purgeObjects}
                onChange={(e) => setPurgeObjects(e.target.checked)}
              />
              Permanently delete all {deleteTarget?.num_objects} objects in this
              bucket
            </label>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ===== S3 credentials ===== */}
      <Dialog open={credsOpen} onOpenChange={setCredsOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>S3 Credentials — {cluster}</DialogTitle>
            <DialogDescription>
              For S3 uid <span className="font-mono">{bastionLogin}</span>. Use
              these with any S3 client.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Endpoint</Label>
              <div className="flex gap-2 items-center">
                <code className="text-xs bg-muted px-2 py-1 rounded flex-1 break-all">
                  {endpoint || "No S3 endpoint advertised for this cluster"}
                </code>
                {endpoint && (
                  <Button size="sm" variant="outline" onClick={() => copy(endpoint, "Endpoint")}>
                    Copy
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                This is a FABNet address — reachable from a FABRIC slice, not
                from the public internet.
              </p>
            </div>

            {!creds && (
              <div className="space-y-2">
                {existingKeys.length > 0 && (
                  <div>
                    <Label>Existing access keys</Label>
                    <ul className="text-xs font-mono space-y-1 mt-1">
                      {existingKeys.map((k) => (
                        <li key={k.access_key} className="bg-muted px-2 py-1 rounded">
                          {k.access_key}
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground mt-1">
                      None of these has a retrievable secret. Generate a new key
                      to obtain a usable credential.
                    </p>
                  </div>
                )}
                <Button onClick={generateKey} disabled={credsLoading}>
                  {credsLoading
                    ? "Working…"
                    : existingKeys.length > 0
                      ? "Generate new access key"
                      : "Create S3 credentials"}
                </Button>
              </div>
            )}

            {creds && (
              <>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">
                    Existing credential for this account. Rotate only if it has
                    been exposed — the old key keeps working until deleted.
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={generateKey}
                    disabled={credsLoading}
                  >
                    {credsLoading ? "Working…" : "Generate another key"}
                  </Button>
                </div>
                <div className="grid gap-2">
                  <div>
                    <Label>Access key</Label>
                    <div className="flex gap-2 items-center">
                      <code className="text-xs bg-muted px-2 py-1 rounded flex-1 break-all">
                        {creds.access_key}
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copy(creds.access_key || "", "Access key")}
                      >
                        Copy
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label>Secret key</Label>
                    <div className="flex gap-2 items-center">
                      <code className="text-xs bg-muted px-2 py-1 rounded flex-1 break-all">
                        {creds.secret_key}
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copy(creds.secret_key || "", "Secret key")}
                      >
                        Copy
                      </Button>
                    </div>
                  </div>
                </div>

                {[
                  { label: "aws-cli", body: awsSnippet },
                  { label: "boto3", body: boto3Snippet },
                  { label: "s3cmd (~/.s3cfg)", body: s3cmdSnippet },
                ].map((s) => (
                  <div key={s.label}>
                    <div className="flex items-center justify-between">
                      <Label>{s.label}</Label>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copy(s.body, s.label)}
                      >
                        Copy
                      </Button>
                    </div>
                    <pre className="text-xs bg-muted p-2 rounded overflow-x-auto whitespace-pre">
                      {s.body}
                    </pre>
                  </div>
                ))}
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCredsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  if (!isOperator) return bucketsPanel;

  const usersPanel = (
    <div className="space-y-4">
      {/* --- Provision S3 users from project members --- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create S3 Users</CardTitle>
          <CardDescription>
            An S3 user id is the member&apos;s bastion login, the same identity
            used for CephFS. Members who already have an account on{" "}
            <strong>{cluster}</strong> are not listed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-48">
              <Label htmlFor="member-search">Filter project members</Label>
              <Input
                id="member-search"
                value={memberSearch}
                placeholder="bastion login…"
                onChange={(e) => setMemberSearch(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setSelectedLogins(
                  selectedLogins.length === provisionableMembers.length
                    ? []
                    : provisionableMembers.map((m) => m.bastion_login)
                )
              }
              disabled={provisionableMembers.length === 0}
            >
              {selectedLogins.length === provisionableMembers.length &&
              provisionableMembers.length > 0
                ? "Clear selection"
                : `Select all (${provisionableMembers.length})`}
            </Button>
            <Button
              size="sm"
              onClick={handleProvisionUsers}
              disabled={provisioning || selectedLogins.length === 0}
            >
              {provisioning
                ? "Creating…"
                : `Create ${selectedLogins.length || ""} S3 user(s)`}
            </Button>
          </div>

          {provisionableMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {projectMembers.length === 0
                ? "No project members loaded."
                : "Every project member already has an S3 account on this cluster."}
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded border">
              {provisionableMembers.map((m) => (
                <label
                  key={m.uuid}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedLogins.includes(m.bastion_login)}
                    onChange={() => toggleLogin(m.bastion_login)}
                  />
                  <span className="font-mono text-xs">{m.bastion_login}</span>
                  {m.membership_types?.includes("owner") && (
                    <Badge variant="secondary">owner</Badge>
                  )}
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* --- Existing S3 users --- */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">
                S3 Users on {cluster}
              </CardTitle>
              <CardDescription>
                Buckets are owned by these users. Deleting a user does not
                delete their buckets unless you purge their data.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadS3Users}
              disabled={usersLoading}
            >
              {usersLoading ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>uid</TableHead>
                <TableHead>Display name</TableHead>
                <TableHead className="text-right">Max buckets</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {s3Users.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center text-sm text-muted-foreground py-6"
                  >
                    {usersLoading ? "Loading…" : "No S3 users on this cluster."}
                  </TableCell>
                </TableRow>
              )}
              {s3Users.map((u) => (
                <TableRow key={u.uid}>
                  <TableCell className="font-mono text-xs">{u.uid}</TableCell>
                  <TableCell>{u.display_name || "—"}</TableCell>
                  <TableCell className="text-right">
                    {u.max_buckets ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        setDeleteUserTarget(u);
                        setPurgeUserData(false);
                      }}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog
        open={!!deleteUserTarget}
        onOpenChange={(open) => !open && setDeleteUserTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete S3 user “{deleteUserTarget?.uid}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Their access keys stop working immediately. Any buckets they own
              are left behind unless you purge their data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={purgeUserData}
              onChange={(e) => setPurgeUserData(e.target.checked)}
            />
            Also permanently delete their buckets and all objects in them
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  return (
    <Tabs defaultValue="buckets">
      <TabsList>
        <TabsTrigger value="buckets">Buckets</TabsTrigger>
        <TabsTrigger value="s3users">S3 Users</TabsTrigger>
      </TabsList>
      <TabsContent value="buckets" className="space-y-4">
        {bucketsPanel}
      </TabsContent>
      <TabsContent value="s3users" className="space-y-4">
        {usersPanel}
      </TabsContent>
    </Tabs>
  );
}
