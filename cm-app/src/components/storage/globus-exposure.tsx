"use client";

/**
 * Publishing one volume over Globus.
 *
 * Phase 2 of the storage-administration design. Before this, exposure was
 * all-or-nothing: a notebook mounted every volume on the DTN and built one
 * collection over the lot. Here an operator picks a volume and the sites to
 * publish it at, and each site's DTN agent converges on it independently.
 *
 * Each site is its own Globus endpoint on its own network, so one volume
 * published at two sites is two collections over the same subvolume - a user
 * picks whichever endpoint is nearer.
 *
 * Publishing is not a local change. It makes data reachable from outside FABRIC
 * by anyone the identity map resolves, so the dialog says who that is and how
 * many, in the same shape as every other multi-principal action on this page.
 */
import { AlertTriangle, ExternalLink, Globe, KeyRound } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  collectionUrl,
  GlobusEndpoint,
  VolumeExposure,
} from "@/services/globus-service";
import { endpointSummary, needsDtnGrant } from "@/lib/globus-exposure";
import { useState } from "react";

// Pure logic lives in lib so it can be tested without React.
export { exposuresForVolume, liveExposures, needsDtnGrant, DTN_CLIENT } from "@/lib/globus-exposure";


const STATE_LABEL: Record<VolumeExposure["state"], string> = {
  requested: "waiting for the agent",
  active: "published",
  failed: "failed",
  removing: "withdrawing",
};

/** What a volume's Globus status looks like in the table. */
export function ExposureStatus({
  exposures,
  onGrantDtn,
  onWithdraw,
  busy,
}: {
  exposures: VolumeExposure[];
  /** Offered only for the "not mounted" failure, which a grant actually fixes. */
  onGrantDtn?: (e: VolumeExposure) => void;
  /**
   * Per site: a volume published at two sites is two collections, and
   * withdrawing it from one must leave the other alone.
   */
  onWithdraw?: (e: VolumeExposure) => void;
  busy?: boolean;
}) {
  if (exposures.length === 0) {
    return <span className="text-sm text-muted-foreground">not published</span>;
  }
  return (
    <div className="space-y-1">
      {exposures.map((e) => (
        <div key={e.site} className="text-sm">
          <Badge
            variant={
              e.state === "active"
                ? "default"
                : e.state === "failed"
                ? "destructive"
                : "secondary"
            }
          >
            {e.site}
          </Badge>{" "}
          <span className="text-muted-foreground">{STATE_LABEL[e.state]}</span>
          {e.state === "active" && e.collection_id && (
            <a
              className="ml-2 inline-flex items-center underline"
              href={collectionUrl(e.collection_id)}
              target="_blank"
              rel="noreferrer"
            >
              open <ExternalLink className="ml-0.5 h-3 w-3" />
            </a>
          )}
          {e.state !== "removing" && onWithdraw && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-1 h-6 px-2 text-xs"
              disabled={busy}
              onClick={() => onWithdraw(e)}
            >
              withdraw
            </Button>
          )}
          {/* The reason, not just the fact. A row that only says "failed"
              sends the operator to a log they may not have. */}
          {e.detail && (
            <div className="text-xs text-amber-700">{e.detail}</div>
          )}
          {needsDtnGrant(e) && onGrantDtn && (
            <Button
              size="sm"
              variant="outline"
              className="mt-1"
              disabled={busy}
              onClick={() => onGrantDtn(e)}
            >
              <KeyRound className="mr-1 h-3 w-3" />
              Grant the DTN access to this volume
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

interface ExposeProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  volumeName: string;
  /** Sites that have an endpoint and do not already publish this volume. */
  endpoints: GlobusEndpoint[];
  /** Who would gain access: project members, or the one owner. */
  reachableBy: string[];
  /** Members with no resolvable Globus identity - they would not get in. */
  unresolved: string[];
  /**
   * Whether the DTN's key can already mount this volume. When it cannot,
   * publishing also grants it - said here rather than discovered a convergence
   * cycle later from a row that says "is not mounted".
   */
  dtnHasAccess: boolean;
  busy?: boolean;
  onExpose: (sites: string[]) => void;
}

export function ExposeDialog(props: ExposeProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>{props.open && <ExposeForm {...props} />}</DialogContent>
    </Dialog>
  );
}

function ExposeForm({
  onOpenChange,
  volumeName,
  endpoints,
  reachableBy,
  unresolved,
  dtnHasAccess,
  busy,
  onExpose,
}: ExposeProps) {
  // Nothing is preselected when there is a choice: each ticked site makes the
  // volume reachable over another network, and that should be a decision. A
  // single available site is preselected, as the one-site dialog always was.
  const [sites, setSites] = useState<string[]>(() =>
    endpoints.length === 1 ? [endpoints[0].site] : []
  );
  const toggle = (site: string, on: boolean) =>
    setSites((cur) => (on ? [...cur, site] : cur.filter((s) => s !== site)));
  const unhealthy = endpoints.filter(
    (e) => sites.includes(e.site) && e.node_state !== "healthy"
  );
  const where =
    sites.length === 0 ? "…" : sites.length === 1 ? sites[0] : `${sites.length} sites`;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Publish {volumeName} over Globus</DialogTitle>
        <DialogDescription>
          The volume stays where it is. Each site gets its own collection that
          reads and writes the same subvolume, so a transfer through any of them
          lands in the volume itself.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium">Sites</label>
          <div className="mt-1 space-y-1">
            {endpoints.map((e) => (
              <label
                key={e.site}
                className="flex cursor-pointer items-start gap-2 rounded border p-2 text-sm"
              >
                <Checkbox
                  className="mt-0.5"
                  checked={sites.includes(e.site)}
                  onCheckedChange={(v) => toggle(e.site, v === true)}
                  disabled={busy}
                />
                <span className="flex-1">
                  <span className="font-medium">{e.site}</span>{" "}
                  <span className="text-muted-foreground">{endpointSummary(e)}</span>
                  {/* Where the node really is. The site key alone misleads:
                      the endpoint registered as UCSD runs at MICH. */}
                  {e.note && (
                    <span className="block text-xs text-muted-foreground">{e.note}</span>
                  )}
                </span>
                <Badge variant={e.node_state === "healthy" ? "secondary" : "destructive"}>
                  {e.node_state}
                </Badge>
              </label>
            ))}
          </div>
          {endpoints.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Every site with an endpoint already publishes this volume.
            </p>
          )}
          {unhealthy.length > 0 && (
            <Alert className="mt-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {unhealthy.map((e) => `${e.site} last reported ${e.node_state}`).join("; ")}.
                The request is recorded and that site&apos;s agent applies it when the
                node is healthy again — nothing is published there until then.
              </AlertDescription>
            </Alert>
          )}
          {sites.length > 1 && (
            <p className="mt-2 text-xs text-muted-foreground">
              These collections are the same data. Users should transfer
              <i> into</i> one of them from elsewhere, not from one to another —
              that would read and write the very same file.
            </p>
          )}
        </div>

        {/* Publishing is outward-facing. Who gains access is the question that
            matters, so it is answered before the button, not after. */}
        <Alert>
          <AlertDescription className="text-sm">
            This makes the volume reachable from outside FABRIC by{" "}
            <b>
              {reachableBy.length} {reachableBy.length === 1 ? "person" : "people"}
            </b>
            {reachableBy.length > 0 && (
              <>: {reachableBy.slice(0, 8).join(", ")}
              {reachableBy.length > 8 ? `, and ${reachableBy.length - 8} more` : ""}</>
            )}
            .
          </AlertDescription>
        </Alert>

        {!dtnHasAccess && (
          <Alert>
            <KeyRound className="h-4 w-4" />
            <AlertDescription className="text-sm">
              The data transfer node cannot read this volume yet, so publishing
              will also grant its key read-write on <b>this volume</b> — not on
              the whole group. Without that the mount fails and the volume stays
              unpublished.
            </AlertDescription>
          </Alert>
        )}

        {unresolved.length > 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              {unresolved.length}{" "}
              {unresolved.length === 1 ? "member has" : "members have"} no Globus
              identity the manager can resolve and will be refused at transfer
              time: {unresolved.join(", ")}. An identity override fixes that.
            </AlertDescription>
          </Alert>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={() => onExpose(sites)} disabled={busy || sites.length === 0}>
          <Globe className="mr-1 h-3 w-3" />
          {busy
            ? "Publishing…"
            : dtnHasAccess
            ? `Publish at ${where}`
            : `Grant and publish at ${where}`}
        </Button>
      </DialogFooter>
    </>
  );
}
