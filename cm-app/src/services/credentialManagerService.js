import http from './httpService';
import { default as config } from "../config.json";

const apiEndpoint = config.credentialManagerApiUrl;

export function createIdToken(projectId, scope) {
  return http.post(apiEndpoint + "/create?projectId=" + projectId + "&scope=" + scope);
}

export function refreshToken(projectId, scope, refresh_token) {
  const data = {
    "refresh_token": refresh_token
  }
  return http.post(apiEndpoint + "/refresh?projectId=" + projectId + "&scope=" + scope, data);
}

export function revokeToken(refresh_token) {
  const data = {
    "refresh_token": refresh_token
  }
  return http.post(apiEndpoint + "/revoke", data);
}