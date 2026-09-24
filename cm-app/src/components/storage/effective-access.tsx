"use client";

/**
 * Effective access, never raw capabilities.
 *
 * The old page printed the cap string. Nobody can tell from
 * `mds: allow rw fsname=CEPH-FS-01 path=/volumes/c93fe500-…` whether a person
 * reaches one volume or all of them, and the column cut it off anyway. Each row
 * here is a sentence an operator can act on, with the raw form still one click
 * away for when it is genuinely needed.
 */
import { useState } from "react";
import { ChevronDown, ChevronRight, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { describeAccess, isBroadGrant } from "@/lib/ceph-caps";
import type { AccessRow } from "@/lib/principals";

interface Props {
  rows: AccessRow[];
  projectNames?: Record<string, string>;
  /** Entities that are service keys, not people - e.g. the Globus DTN. */
  serviceEntities?: string[];
  emptyMessage?: string;
}

export function EffectiveAccess({
  rows,
  projectNames,
  serviceEntities = ["globus-dtn"],
  emptyMessage = "Nobody has access to this storage.",
}: Props) {
  const [showRaw, setShowRaw] = useState(false);

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  const broad = rows.filter((r) => isBroadGrant(r.grant));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {rows.length} {rows.length === 1 ? "grant" : "grants"}
          {broad.length > 0 && (
            <>
              {" · "}
              <span className="text-amber-700">
                {broad.length} reach more than one volume
              </span>
            </>
          )}
        </p>
        <Button variant="ghost" size="sm" onClick={() => setShowRaw((v) => !v)}>
          {showRaw ? <ChevronDown className="h-3 w-3 mr-1" /> : <ChevronRight className="h-3 w-3 mr-1" />}
          {showRaw ? "Hide" : "Show"} raw capabilities
        </Button>
      </div>

      <ul className="space-y-2">
        {rows.map((row, i) => {
          const wide = isBroadGrant(row.grant);
          const isService = serviceEntities.includes(row.login);
          return (
            <li
              key={`${row.entity}-${i}`}
              className={`rounded-md border p-2 text-sm ${
                wide && !isService ? "border-amber-400 bg-amber-50" : "border-border"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="font-medium">{row.person || row.login}</span>
                  {row.person && (
                    <span className="text-muted-foreground"> ({row.login})</span>
                  )}
                  <div className="text-muted-foreground">
                    {describeAccess(row.grant, { projectNames })}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  {isService && <Badge variant="secondary">service key</Badge>}
                  {wide && (
                    <Badge
                      variant={isService ? "secondary" : "destructive"}
                      className="gap-1"
                    >
                      {!isService && <ShieldAlert className="h-3 w-3" />}
                      wide
                    </Badge>
                  )}
                </div>
              </div>
              {showRaw && (
                <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-xs">
                  {row.grant.raw}
                </pre>
              )}
            </li>
          );
        })}
      </ul>

      {broad.some((r) => !serviceEntities.includes(r.login)) && (
        <p className="text-xs text-amber-700">
          A wide grant covers every volume in the group, including volumes
          created later. For a person that is almost always a mistake; for a
          service key such as the Globus DTN it is expected.
        </p>
      )}
    </div>
  );
}
