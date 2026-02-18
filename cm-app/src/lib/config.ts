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
