import axios from "axios";

/**
 * The Globus ingest path, as the Ceph Manager exposes it.
 *
 * Shapes here are copied from live responses, not inferred from the handler
 * names. Four separate bugs in this app came from an interface that described
 * a response nobody had looked at - `cluster` vs `name`, `size_kb` vs `size`,
 * `clusters{}` vs `data{}` - and each one typechecked perfectly while being
 * wrong.
 *
 *   GET /globus/endpoints  -> { endpoints: [ ... ] }
 *   GET /globus/exposures  -> { exposures: [ ... ] }
 *
 * Both are plain keyed objects, NOT the `{data: [...]}` envelope the CephFS
 * and S3 endpoints use.
 */
function storageApi(token: string) {
  return axios.create({
    baseURL: "/api/storage",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
}

export type Uplink = "facility_port" | "fabnetv4ext";
export type NodeState = "unknown" | "healthy" | "degraded" | "down";
export type ExposureState = "requested" | "active" | "failed" | "removing";

export interface GlobusEndpoint {
  site: string;
  endpoint_id: string | null;
  domain: string | null;
  uplink: Uplink;
  public_v4: string | null;
  public_v6: string | null;
  node_state: NodeState;
  last_seen: string | null;
  note: string | null;
}

export interface VolumeExposure {
  cluster: string;
  group_name: string;
  subvol_name: string;
  site: string;
  owner_kind: "user" | "project" | null;
  owner_uuid: string | null;
  collection_id: string | null;
  mount_path: string | null;
  state: ExposureState;
  detail: string | null;
  requested_by: string;
  requested_at: string;
  converged_at: string | null;
}

export function listGlobusEndpoints(token: string) {
  return storageApi(token).get<{ endpoints: GlobusEndpoint[] }>("/globus/endpoints");
}

export function listGlobusExposures(token: string, params: { cluster?: string } = {}) {
  const q = params.cluster ? `?cluster=${encodeURIComponent(params.cluster)}` : "";
  return storageApi(token).get<{ exposures: VolumeExposure[] }>(`/globus/exposures${q}`);
}

export function createGlobusExposure(
  token: string,
  body: {
    cluster: string;
    group_name: string;
    subvol_name: string;
    site: string;
    /** The person who owns a user volume. Ignored for a project volume. */
    owner_uuid?: string;
  }
) {
  return storageApi(token).post<VolumeExposure>("/globus/exposures", body);
}

/**
 * Withdraw an exposure.
 *
 * This marks it `removing` rather than deleting it: the collection and the
 * mount still exist on the DTN, and dropping the record would leave the agent
 * with no instruction to tear them down. The row disappears once the agent
 * confirms.
 */
export function deleteGlobusExposure(
  token: string,
  cluster: string,
  groupName: string,
  subvolName: string,
  site: string
) {
  const p = [cluster, groupName, subvolName, site].map(encodeURIComponent).join("/");
  return storageApi(token).delete<VolumeExposure>(`/globus/exposures/${p}`);
}

/** Where a user goes to actually use the collection. */
export function collectionUrl(collectionId: string): string {
  return `https://app.globus.org/file-manager?origin_id=${collectionId}`;
}
