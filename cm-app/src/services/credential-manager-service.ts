import http from "./http-service";
import { getCredentialManagerApiUrl } from "@/lib/config";

function getApiEndpoint() {
  return getCredentialManagerApiUrl();
}

export function createIdToken(
  projectId: string,
  scope: string,
  lifetime: number,
  comment: string
) {
  return http.post(
    getApiEndpoint() +
      "/create?project_id=" +
      projectId +
      "&scope=" +
      scope +
      "&lifetime=" +
      lifetime +
      "&comment=" +
      comment
  );
}

export function refreshToken(
  projectId: string,
  scope: string,
  refresh_token: string
) {
  const data = { refresh_token };
  return http.post(
    getApiEndpoint() + "/refresh?project_id=" + projectId + "&scope=" + scope,
    data
  );
}

export function revokeToken(token_type: string, token: string) {
  const data = { token, type: token_type };
  return http.post(getApiEndpoint() + "/revokes", data);
}

export function tokenRevokeList(projectId: string) {
  return http.get(getApiEndpoint() + "/revoke_list?project_id=" + projectId);
}

export function getTokenByHash(tokenHash: string) {
  return http.get(
    getApiEndpoint() + "?token_hash=" + tokenHash + "&limit=200&offset=0"
  );
}

export function getTokenByProjectId(projectId: string) {
  return http.get(
    getApiEndpoint() + "?project_id=" + projectId + "&limit=200&offset=0"
  );
}

export function getTokens() {
  return http.get(getApiEndpoint() + "?limit=200&offset=0");
}

export function validateToken(token: string) {
  const data = { token, type: "identity" };
  return http.post(getApiEndpoint() + "/validate", data);
}

// LLM Token Management

export function createLLMKey(
  keyName: string | null,
  comment: string | null,
  duration: number
) {
  let url = getApiEndpoint() + "/create_llm?";
  if (keyName) {
    url += "key_name=" + encodeURIComponent(keyName) + "&";
  }
  if (comment) {
    url += "comment=" + encodeURIComponent(comment) + "&";
  }
  if (duration) {
    url += "duration=" + encodeURIComponent(duration);
  }
  return http.post(url);
}

export function getLLMKeys(limit = 200, offset = 0) {
  return http.get(
    getApiEndpoint() + "/llm_keys?limit=" + limit + "&offset=" + offset
  );
}

export function deleteLLMKey(llmKeyId: string) {
  return http.delete(
    getApiEndpoint() + "/delete_llm/" + encodeURIComponent(llmKeyId)
  );
}

export function getLLMModels() {
  return http.get(getApiEndpoint() + "/llm_models");
}
