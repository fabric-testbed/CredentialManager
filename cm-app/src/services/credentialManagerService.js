import http from './httpService';
import { default as config } from "../config.json";
import checkCmAppType from "../utils/checkCmAppType";

const apiEndpoint = config.credentialManagerApiUrl[checkCmAppType()];

export function createIdToken(projectId, scope) {
  return http.post(apiEndpoint + "/create?project_id=" + projectId + "&scope=" + scope);
}

export function refreshToken(projectId, scope, refresh_token) {
  const data = {
    "refresh_token": refresh_token
  }
  return http.post(apiEndpoint + "/refresh?project_id=" + projectId + "&scope=" + scope, data);
}

export function revokeToken(refresh_token) {
  const data = {
    "refresh_token": refresh_token
  }
  return http.post(apiEndpoint + "/revoke", data);
}