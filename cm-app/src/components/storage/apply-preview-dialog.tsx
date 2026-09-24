"use client";

/**
 * Preview before apply.
 *
 * Any action touching more than one principal resolves the list first, shows it
 * with a count, and the confirmation names that count. On 2026-09-23 an
 * "Entire Project" apply reported `Applying capabilities to 276 user(s)...`
 * for a project with five members, and there was no list to notice it in.
 *
 * Two rules this enforces structurally rather than by reminding anyone:
 *
 *  - the confirm button carries the number, so an unexpected blast radius is in
 *    the thing you click, not in a line of text above it;
 *  - an incomplete resolution disables the action entirely, because applying to
 *    a subset of unknown size is the same class of bug as applying to everyone.
 */
import { AlertTriangle } from "lucide-react";

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
import type { GranteeResolution } from "@/lib/principals";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** What will happen, e.g. "Grant read-write on nrig". */
  action: string;
  resolution: GranteeResolution;
  busy?: boolean;
  destructive?: boolean;
  onConfirm: () => void;
}

export function ApplyPreviewDialog({
  open,
  onOpenChange,
  title,
  action,
  resolution,
  busy,
  destructive,
  onConfirm,
}: Props) {
  const { granted, withoutStorage, memberCount, complete } = resolution;
  const n = granted.length;
  const blocked = !complete || n === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{action}</DialogDescription>
        </DialogHeader>

        {!complete && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              The storage user list is not known to be complete, so this list
              may be missing people. Reload before applying — acting on a subset
              of unknown size is how a partial apply gets reported as a success.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium">
            This will apply to {n} of {memberCount}{" "}
            {memberCount === 1 ? "member" : "members"}:
          </p>
          {n === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nobody. No member of this project has a storage account, so there
              is nothing to apply to.
            </p>
          ) : (
            <ul className="max-h-48 overflow-y-auto rounded-md border p-2 text-sm">
              {granted.map((g) => (
                <li key={g.uuid} className="py-0.5">
                  {g.name ? (
                    <>
                      {g.name}{" "}
                      <span className="text-muted-foreground">({g.bastion_login})</span>
                    </>
                  ) : (
                    g.bastion_login
                  )}
                </li>
              ))}
            </ul>
          )}

          {withoutStorage.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                {withoutStorage.length}{" "}
                {withoutStorage.length === 1 ? "member has" : "members have"} no
                storage account and will not be affected:{" "}
                {withoutStorage.map((m) => m.name || m.uuid).join(", ")}. They
                need storage provisioned before this reaches them.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={blocked || busy}
          >
            {busy
              ? "Applying…"
              : `Apply to ${n} ${n === 1 ? "person" : "people"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
