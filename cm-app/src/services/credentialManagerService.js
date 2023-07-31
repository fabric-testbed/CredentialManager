import http from './httpService';
import { default as config } from "../config.json";
import checkCmAppType from "../utils/checkCmAppType";

const apiEndpoint = config.credentialManagerApiUrl[checkCmAppType()];

export function createIdToken(projectId, scope, lifetime, comment) {
  return http.post(apiEndpoint + "/create?project_id=" + projectId + "&scope=" + scope + "&lifetime=" + lifetime + "&comment=" + comment)
}

export function refreshToken(projectId, scope, refresh_token) {
  const data = {
    "refresh_token": refresh_token
  }
  return http.post(apiEndpoint + "/refresh?project_id=" + projectId + "&scope=" + scope, data);
}

export function revokeToken(token_type, token) {
  const data = {
    "token": token,
    "type": token_type
  }
  return http.post(apiEndpoint + "/revokes", data);
}

export function tokenRevokeList(projectId) {
  return http.get(apiEndpoint + "/revoke_list?project_id=" + projectId);
}

export function getTokenByHash(tokenHash) {
  return http.get(apiEndpoint + "?token_hash=" + tokenHash + "&limit=200&offset=0");
}

export function getTokenByProjectId(projectId) {
  return http.get(apiEndpoint + "?project_id=" + projectId + "&limit=200&offset=0")
}

export function getTokens() {
  return http.get(apiEndpoint + "?limit=200&offset=0");
}

export function validateToken(token) {
  const data = {
    "token": token,
    "type": "identity"
  }
  return http.post(apiEndpoint + "/validate", data);
}