import http from "./http-service";
import { getCoreApiUrl } from "@/lib/config";

function getApiEndpoint() {
  return getCoreApiUrl();
}

export function getWhoAmI() {
  return http.get(`${getApiEndpoint()}/whoami`);
}

export function getProjects(userID: string) {
  return http.get(
    `${getApiEndpoint()}/projects?offset=0&limit=200&person_uuid=${userID}`
  );
}
