"use client";

/**
 * Publishing one volume over Globus.
 *
 * Phase 2 of the storage-administration design. Before this, exposure was
 * all-or-nothing: a notebook mounted every volume on the DTN and built one
 * collection over the lot. Here an operator picks a volume and a site, and the
 * DTN's agent converges on it.
 *
 * Publishing is not a local change. It makes data reachable from outside FABRIC
 * by anyone the identity map resolves, so the dialog says who that is and how
 * many, in the same shape as every other multi-principal action on this page.
 */
import { AlertTriangle, ExternalLink, Globe } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  collectionUrl,
  GlobusEndpoint,
  VolumeExposure,
} from "@/services/globus-service";
import { useState } from "react";

// Pure logic lives in lib so it can be tested without React.
export { exposuresForVolume, liveExposure } from "@/lib/globus-exposure";


const STATE_LABEL: Record<VolumeExposure["state"], string> = {
  requested: "waiting for the agent",
  active: "published",
  failed: "failed",
  removing: "withdrawing",
};

/** What a volume's Globus status looks like in the table. */
export function ExposureStatus({ exposures }: { exposures: VolumeExposure[] }) {
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
          {/* The reason, not just the fact. A row that only says "failed"
              sends the operator to a log they may not have. */}
          {e.detail && (
            <div className="text-xs text-amber-700">{e.detail}</div>
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
  /** Sites that have an endpoint and do not already expose this volume. */
  endpoints: GlobusEndpoint[];
  /** Who would gain access: project members, or the one owner. */
  reachableBy: string[];
  /** Members with no resolvable Globus identity - they would not get in. */
  unresolved: string[];
  busy?: boolean;
  onExpose: (site: string) => void;
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
  busy,
  onExpose,
}: ExposeProps) {
  const [site, setSite] = useState(() => endpoints[0]?.site ?? "");
  const endpoint = endpoints.find((e) => e.site === site);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Publish {volumeName} over Globus</DialogTitle>
        <DialogDescription>
          The volume stays where it is. A collection is created that reads and
          writes the same subvolume, so a transfer lands in the volume itself.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium">Site</label>
          <Select value={site} onValueChange={setSite}>
            <SelectTrigger>
              <SelectValue placeholder="Choose an endpoint" />
            </SelectTrigger>
            <SelectContent>
              {endpoints.map((e) => (
                <SelectItem key={e.site} value={e.site}>
                  {e.site}
                  {e.node_state !== "healthy" ? ` (${e.node_state})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {endpoints.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Every site with an endpoint already publishes this volume.
            </p>
          )}
          {endpoint && endpoint.node_state !== "healthy" && (
            <Alert className="mt-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                That endpoint last reported <b>{endpoint.node_state}</b>. The
                request will be recorded and the agent will apply it when the
                node is healthy again — nothing is published until then.
              </AlertDescription>
            </Alert>
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
        <Button onClick={() => onExpose(site)} disabled={busy || !site}>
          <Globe className="mr-1 h-3 w-3" />
          {busy ? "Publishing…" : `Publish at ${site || "…"}`}
        </Button>
      </DialogFooter>
    </>
  );
}
