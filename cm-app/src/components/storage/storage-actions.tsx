"use client";

/**
 * Operator actions, expressed against the principal already chosen.
 *
 * There is no "scope" control in any of these. The owning group follows from
 * the principal - `fabric_users` for a person, the project's uuid for a project
 * - so the question "which group does this belong to?" is answered before the
 * dialog opens rather than by a dropdown the operator has to get right.
 */
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NO_GROUP, Principal, USER_GROUP, VolumeRow } from "@/lib/principals";

export function groupFor(principal: Principal): string | undefined {
  // undefined means "no group parameter", which the API treats as _nogroup.
  return principal.kind === "user" ? USER_GROUP : principal.uuid;
}

/** A project volume defaults to the project's name, lowercased and safe. */
export function suggestedVolumeName(principal: Principal): string {
  if (principal.kind === "user") return principal.login;
  return principal.name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

interface CreateProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  principal: Principal;
  cluster: string;
  existing: VolumeRow[];
  busy?: boolean;
  onCreate: (name: string, group: string | undefined, sizeBytes: number) => void;
}

export function CreateVolumeDialog(props: CreateProps) {
  // Mounted only while open, so the form starts from props each time rather
  // than being reset by an effect after the fact.
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>{props.open && <CreateVolumeForm {...props} />}</DialogContent>
    </Dialog>
  );
}

function CreateVolumeForm({
  onOpenChange,
  principal,
  cluster,
  existing,
  busy,
  onCreate,
}: CreateProps) {
  const [name, setName] = useState(() => suggestedVolumeName(principal));
  const [sizeGiB, setSizeGiB] = useState(10);

  const group = groupFor(principal);
  const clash = existing.some((v) => v.name === name);
  // A person gets one volume named after their login; anything else will not be
  // found by the tooling, which looks it up by name.
  const lockedName = principal.kind === "user";

  return (
    <>
        <DialogHeader>
          <DialogTitle>Create a volume for {principal.name}</DialogTitle>
          <DialogDescription>
            On {cluster}, in{" "}
            {principal.kind === "user"
              ? `the ${USER_GROUP} group`
              : `this project's group (${principal.uuid.slice(0, 8)}…)`}
            .
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="vol-name">Volume name</Label>
            <Input
              id="vol-name"
              value={name}
              disabled={lockedName}
              onChange={(e) => setName(e.target.value)}
            />
            {lockedName && (
              <p className="mt-1 text-xs text-muted-foreground">
                A person&apos;s volume is named after their login — the mount
                tooling looks it up by that name.
              </p>
            )}
            {clash && (
              <p className="mt-1 text-xs text-amber-700">
                A volume with this name already exists here. Creating it again
                will resize the existing one rather than make a second.
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="vol-size">Quota (GiB)</Label>
            <Input
              id="vol-size"
              type="number"
              min={1}
              value={sizeGiB}
              onChange={(e) => setSizeGiB(Number(e.target.value))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => onCreate(name, group, sizeGiB * 1024 ** 3)}
            disabled={busy || !name || sizeGiB < 1}
          >
            {busy ? "Creating…" : clash ? "Resize existing" : "Create volume"}
          </Button>
        </DialogFooter>
    </>
  );
}

interface ResizeProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  volume: VolumeRow | null;
  busy?: boolean;
  onResize: (sizeBytes: number) => void;
}

export function ResizeVolumeDialog(props: ResizeProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        {props.open && props.volume && <ResizeVolumeForm {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function ResizeVolumeForm({ onOpenChange, volume, busy, onResize }: ResizeProps) {
  const usedGiB = (volume?.bytesUsed ?? 0) / 1024 ** 3;
  const [sizeGiB, setSizeGiB] = useState(() =>
    Math.max(1, Math.round((volume?.bytesQuota ?? 1024 ** 3) / 1024 ** 3))
  );

  const shrinkingBelowUse = sizeGiB > 0 && sizeGiB < usedGiB;

  return (
    <>
        <DialogHeader>
          <DialogTitle>Resize {volume?.name}</DialogTitle>
          <DialogDescription>
            Currently using {usedGiB.toFixed(2)} GiB.
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor="resize">New quota (GiB), 0 for unlimited</Label>
          <Input
            id="resize"
            type="number"
            min={0}
            value={sizeGiB}
            onChange={(e) => setSizeGiB(Number(e.target.value))}
          />
          {shrinkingBelowUse && (
            <Alert variant="destructive" className="mt-2">
              <AlertDescription>
                That is below what the volume already holds. Ceph will not delete
                data, but writes will fail until it is under quota.
              </AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => onResize(sizeGiB * 1024 ** 3)} disabled={busy}>
            {busy ? "Resizing…" : "Resize"}
          </Button>
        </DialogFooter>
    </>
  );
}

interface DeleteProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  volume: VolumeRow | null;
  /** Everyone who currently holds a grant on it, so the cost is visible. */
  holders: string[];
  busy?: boolean;
  onDelete: () => void;
}

export function DeleteVolumeDialog(props: DeleteProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        {props.open && props.volume && <DeleteVolumeForm {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function DeleteVolumeForm({ onOpenChange, volume, holders, busy, onDelete }: DeleteProps) {
  const [typed, setTyped] = useState("");

  const hasData = (volume?.bytesUsed ?? 0) > 0;
  // Typing the name is the only gate here. A volume delete destroys data that
  // nothing in this system backs up, and a misplaced click on the row above is
  // otherwise all it takes.
  const confirmed = typed === volume?.name;

  return (
    <>
        <DialogHeader>
          <DialogTitle>Delete {volume?.name}</DialogTitle>
          <DialogDescription>
            This destroys the volume and everything in it. Nothing in this system
            backs it up.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {hasData && (
            <Alert variant="destructive">
              <AlertDescription>
                It currently holds{" "}
                {((volume?.bytesUsed ?? 0) / 1024 ** 3).toFixed(2)} GiB of data.
              </AlertDescription>
            </Alert>
          )}
          {holders.length > 0 && (
            <Alert>
              <AlertDescription>
                {holders.length}{" "}
                {holders.length === 1 ? "principal holds" : "principals hold"} a
                capability on it and will be left with a grant on a path that no
                longer exists: {holders.join(", ")}.
              </AlertDescription>
            </Alert>
          )}
          <div>
            <Label htmlFor="confirm-name">
              Type <span className="font-mono">{volume?.name}</span> to confirm
            </Label>
            <Input
              id="confirm-name"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onDelete} disabled={!confirmed || busy}>
            {busy ? "Deleting…" : "Delete volume"}
          </Button>
        </DialogFooter>
    </>
  );
}

interface BucketProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  principal: Principal;
  cluster: string;
  /** Candidate owners: the person, or the project's members with storage. */
  owners: Array<{ login: string; name?: string }>;
  busy?: boolean;
  onCreate: (bucket: string, uid: string) => void;
}

export function CreateBucketDialog(props: BucketProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>{props.open && <CreateBucketForm {...props} />}</DialogContent>
    </Dialog>
  );
}

function CreateBucketForm({
  onOpenChange,
  principal,
  cluster,
  owners,
  busy,
  onCreate,
}: BucketProps) {
  const [bucket, setBucket] = useState("");
  const [uid, setUid] = useState(() =>
    principal.kind === "user" ? principal.login : owners[0]?.login ?? ""
  );

  // RGW bucket names are DNS labels.
  const valid = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket);

  return (
    <>
        <DialogHeader>
          <DialogTitle>Create a bucket</DialogTitle>
          <DialogDescription>
            On {cluster}.{" "}
            {principal.kind === "project" &&
              "RGW has no project owner, so the bucket belongs to a member."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="bucket-name">Bucket name</Label>
            <Input
              id="bucket-name"
              value={bucket}
              placeholder="nrig-data"
              onChange={(e) => setBucket(e.target.value.toLowerCase())}
            />
            {bucket && !valid && (
              <p className="mt-1 text-xs text-amber-700">
                Lowercase letters, digits, dots and hyphens; 3–63 characters;
                must start and end alphanumeric.
              </p>
            )}
          </div>
          {principal.kind === "project" && (
            <div>
              <Label>Owner</Label>
              <Select value={uid} onValueChange={setUid}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a member" />
                </SelectTrigger>
                <SelectContent>
                  {owners.map((o) => (
                    <SelectItem key={o.login} value={o.login}>
                      {o.name ? `${o.name} (${o.login})` : o.login}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {owners.length === 0 && (
                <p className="mt-1 text-xs text-amber-700">
                  No member of this project has a storage account, so there is
                  nobody to own a bucket.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => onCreate(bucket, uid)} disabled={busy || !valid || !uid}>
            {busy ? "Creating…" : "Create bucket"}
          </Button>
        </DialogFooter>
    </>
  );
}

export { NO_GROUP };
