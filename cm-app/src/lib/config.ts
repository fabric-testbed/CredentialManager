export const apiConfig = {
  fabricCoreApiUrl: {
    alpha: "https://alpha-6.fabric-testbed.net",
    beta: "https://beta-3.fabric-testbed.net",
    production: "https://uis.fabric-testbed.net",
  },
  credentialManagerApiUrl: {
    alpha: "https://alpha-2.fabric-testbed.net/credmgr/tokens",
    beta: "https://beta-2.fabric-testbed.net/credmgr/tokens",
    production: "https://cm.fabric-testbed.net/credmgr/tokens",
  },
  storageApiUrl: {
    alpha: "https://ceph-mgr.fabric-testbed.net",
    beta: "https://ceph-mgr.fabric-testbed.net",
    production: "https://ceph-mgr.fabric-testbed.net",
  },
  authCookieName: {
    alpha: "fabric-service-alpha",
    beta: "fabric-service-beta",
    production: "fabric-service",
  },
  llmProjectName: {
    alpha: "FABRIC-LLM",
    beta: "FABRIC-LLM",
    production: "FABRIC-LLM",
  },
  storageProject: {
    alpha: "FABRIC-Storage",
    beta: "FABRIC-Storage",
    production: "FABRIC-Storage",
  },
  // UUID of the "Service - FABRIC Ceph" project. The Ceph Manager treats owners
  // of this project as operators, so the UI must recognise the same project to
  // show the same controls. Project ownership appears in the Core API roles
  // list as "<project-uuid>-po".
  storageServiceProjectUuid: {
    alpha: "6b8dd6eb-4b2b-4656-b3ee-ce61f91a12b4",
    beta: "6b8dd6eb-4b2b-4656-b3ee-ce61f91a12b4",
    production: "6b8dd6eb-4b2b-4656-b3ee-ce61f91a12b4",
  },
} as const;

export type Environment = "alpha" | "beta" | "production";

export function getEnvironment(): Environment {
  if (typeof window === "undefined") return "production";
  const href = window.location.href;
  if (href.includes("alpha")) return "alpha";
  if (href.includes("beta")) return "beta";
  return "production";
}

export function getCoreApiUrl(): string {
  return apiConfig.fabricCoreApiUrl[getEnvironment()];
}

export function getCredentialManagerApiUrl(): string {
  return apiConfig.credentialManagerApiUrl[getEnvironment()];
}

export function getLlmProjectName(): string {
  return apiConfig.llmProjectName[getEnvironment()];
}

export function getStorageApiUrl(): string {
  return apiConfig.storageApiUrl[getEnvironment()];
}

export function getStorageProject(): string {
  return apiConfig.storageProject[getEnvironment()];
}

export function getStorageServiceProjectUuid(): string {
  return apiConfig.storageServiceProjectUuid[getEnvironment()];
}

/**
 * True when `roleName` denotes ownership of the FABRIC Ceph service project.
 *
 * The Core API expresses project roles as `<project-uuid>-po` (owner) and
 * `<project-uuid>-pm` (member); only the owner suffix grants operator rights,
 * matching the Ceph Manager's `is_owner` check.
 */
export function isStorageProjectOwnerRole(roleName: string): boolean {
  if (!roleName) return false;
  const uuid = getStorageServiceProjectUuid().toLowerCase();
  return roleName.toLowerCase() === `${uuid}-po`;
}

// Feature flags — set to true to enable
export const featureFlags = {
  llmTokens: false,
  storage: true,
} as const;
