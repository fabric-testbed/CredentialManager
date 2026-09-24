"use client";

/**
 * The storage session: a short-lived Ceph Manager token, whether the caller is
 * an operator, and the clusters they can act on.
 *
 * Lifted out of the storage page so the principal-first admin view does not
 * carry a second copy. The operator rule deliberately mirrors the Ceph
 * Manager's own `authorize()` - facility admin OR owner of the storage service
 * project - because the server enforces it either way and a UI that disagrees
 * only produces confusing 401s.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { getStorageProject, isStorageProjectOwnerRole } from "@/lib/config";
import { createIdToken } from "@/services/credential-manager-service";
import { getPerson, getProjects } from "@/services/core-api-service";
import { getClusterInfo } from "@/services/storage-service";

const TOKEN_LIFETIME_MS = 30 * 60 * 1000;

/**
 * A row of `/cluster/info`, as the service actually returns it.
 *
 * The field is `cluster`, not `name`, and there is no `default_fs` - the
 * filesystem name is a constant on the client side. An invented shape
 * typechecks perfectly and then renders "No volume on ." against an empty
 * dropdown, because nothing validates a response against its interface.
 */
export interface ClusterInfo {
  cluster: string;
  fsid?: string;
  mon_host?: string;
  ceph_conf_minimal?: string;
  s3_endpoints?: string[];
  error?: string | null;
}

export function errorMessage(error: unknown, fallback: string): string {
  const e = error as {
    response?: { data?: { errors?: Array<{ details?: string }>; message?: string } };
    message?: string;
  };
  return (
    e?.response?.data?.errors?.[0]?.details ||
    e?.response?.data?.message ||
    e?.message ||
    fallback
  );
}

export function useStorageSession(enabled: boolean) {
  const [isOperator, setIsOperator] = useState(false);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [bastionLogin, setBastionLogin] = useState("");
  const [clusters, setClusters] = useState<ClusterInfo[]>([]);
  const [cluster, setCluster] = useState("");

  const tokenRef = useRef<{ value: string; at: number }>({ value: "", at: 0 });

  const ensureToken = useCallback(async (): Promise<string> => {
    const { value, at } = tokenRef.current;
    if (value && Date.now() - at < TOKEN_LIFETIME_MS) return value;

    const userId = sessionStorage.getItem("cmUserID");
    if (!userId) throw new Error("Not logged in");
    const { data: projRes } = await getProjects(userId);
    const projects = projRes.results || [];
    const wanted = getStorageProject();
    const project =
      projects.find((p: { name: string }) => p.name === wanted) ||
      projects.find((p: { active: boolean }) => p.active);
    if (!project) throw new Error("No usable project found for a storage token");
    const { data: res } = await createIdToken(project.uuid, "all", 1, "storage-admin");
    const token = res.data[0].id_token;
    tokenRef.current = { value: token, at: Date.now() };
    return token;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const userId = sessionStorage.getItem("cmUserID");
        if (!userId) return;
        const { data: res } = await getPerson(userId);
        const person = res.results[0];
        if (cancelled) return;
        setBastionLogin(person.bastion_login || "");
        const roles: Array<{ name: string }> = person.roles || [];
        const facilityAdmin = roles.some((r) =>
          ["facility-operators", "facility-operator", "Facility Operators"].includes(r.name)
        );
        const serviceOwner = roles.some((r) => isStorageProjectOwnerRole(r.name));
        setIsOperator(facilityAdmin || serviceOwner);
      } catch (ex) {
        toast.error(errorMessage(ex, "Failed to load your profile."));
      } finally {
        if (!cancelled) setRoleLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !roleLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await ensureToken();
        const { data } = await getClusterInfo(token);
        if (cancelled) return;
        const rows: ClusterInfo[] = data?.data ?? [];
        setClusters(rows);
        setCluster((c) => c || rows[0]?.cluster || "");
      } catch (ex) {
        toast.error(errorMessage(ex, "Failed to load clusters."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, roleLoaded, ensureToken]);

  return { isOperator, roleLoaded, bastionLogin, clusters, cluster, setCluster, ensureToken };
}
