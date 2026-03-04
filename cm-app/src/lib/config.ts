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

// Feature flags — set to true to enable
export const featureFlags = {
  llmTokens: false,
  storage: true,
} as const;
