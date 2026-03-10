import axios from "axios";

function storageApi(token: string) {
  return axios.create({
    baseURL: "/api/storage",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

// Cluster Info

export function getClusterInfo(token: string) {
  return storageApi(token).get("/cluster/info");
}

// Subvolume Groups

export function listSubvolumeGroups(
  token: string,
  cluster: string,
  volName: string,
  info = false
) {
  return storageApi(token).get(
    `/cephfs/subvolume/group/${volName}?cluster=${cluster}&info=${info}`
  );
}

// Subvolumes

export function listSubvolumes(
  token: string,
  cluster: string,
  volName: string,
  groupName?: string,
  info = false
) {
  let url = `/cephfs/subvolume/${volName}?cluster=${cluster}&info=${info}`;
  if (groupName) url += `&group_name=${encodeURIComponent(groupName)}`;
  return storageApi(token).get(url);
}

export function createOrResizeSubvolume(
  token: string,
  cluster: string,
  volName: string,
  body: {
    subvol_name: string;
    group_name?: string;
    size: number;
    mode?: string;
  }
) {
  return storageApi(token).put(
    `/cephfs/subvolume/${volName}?cluster=${cluster}`,
    body
  );
}

export function getSubvolumeInfo(
  token: string,
  cluster: string,
  volName: string,
  subvolName: string,
  groupName?: string
) {
  let url = `/cephfs/subvolume/${volName}/info?cluster=${cluster}&subvol_name=${encodeURIComponent(subvolName)}`;
  if (groupName) url += `&group_name=${encodeURIComponent(groupName)}`;
  return storageApi(token).get(url);
}

export function deleteSubvolume(
  token: string,
  cluster: string,
  volName: string,
  subvolName: string,
  groupName?: string,
  force = false
) {
  let url = `/cephfs/subvolume/${volName}?cluster=${cluster}&subvol_name=${encodeURIComponent(subvolName)}&force=${force}`;
  if (groupName) url += `&group_name=${encodeURIComponent(groupName)}`;
  return storageApi(token).delete(url);
}

// CephX Users

export function listCephUsers(token: string, cluster: string) {
  return storageApi(token).get(`/cluster/user?cluster=${cluster}`);
}

export function applyUserCaps(
  token: string,
  cluster: string,
  body: {
    user_entity: string;
    template_capabilities: Array<{ entity: string; cap: string }>;
    renders: Array<{
      fs_name: string;
      subvol_name: string;
      group_name: string;
    }>;
    sync_across_clusters?: boolean;
    merge_strategy?: string;
  }
) {
  return storageApi(token).post(`/cluster/user?cluster=${cluster}`, body);
}

export function overwriteUserCaps(
  token: string,
  cluster: string,
  body: {
    user_entity: string;
    capabilities: Array<{ entity: string; cap: string }>;
  }
) {
  return storageApi(token).put(`/cluster/user?cluster=${cluster}`, body);
}

export function exportUserKeyrings(
  token: string,
  cluster: string,
  entities: string[]
) {
  return storageApi(token).post(`/cluster/user/export?cluster=${cluster}`, {
    entities,
  });
}

export function deleteCephUser(
  token: string,
  cluster: string,
  entity: string
) {
  return storageApi(token).delete(
    `/cluster/user/${encodeURIComponent(entity)}?cluster=${cluster}`
  );
}

// Project Members

export function listProjectMembers(token: string) {
  return storageApi(token).get("/project/members");
}

// S3 Users

export function listS3Users(token: string, cluster: string) {
  return storageApi(token).get(`/s3/user?cluster=${cluster}`);
}

export function createS3User(
  token: string,
  cluster: string,
  body: { uid: string; display_name: string; email?: string }
) {
  return storageApi(token).post(`/s3/user?cluster=${cluster}`, body);
}

export function deleteS3User(
  token: string,
  cluster: string,
  uid: string
) {
  return storageApi(token).delete(
    `/s3/user/${encodeURIComponent(uid)}?cluster=${cluster}`
  );
}

export function getS3UserKeys(
  token: string,
  cluster: string,
  uid: string
) {
  return storageApi(token).get(
    `/s3/user/${encodeURIComponent(uid)}/key?cluster=${cluster}`
  );
}

export function createS3Key(
  token: string,
  cluster: string,
  uid: string
) {
  return storageApi(token).post(
    `/s3/user/${encodeURIComponent(uid)}/key?cluster=${cluster}`,
    {}
  );
}

export function deleteS3Key(
  token: string,
  cluster: string,
  uid: string,
  accessKey: string
) {
  return storageApi(token).delete(
    `/s3/user/${encodeURIComponent(uid)}/key?cluster=${cluster}&access_key=${encodeURIComponent(accessKey)}`
  );
}
