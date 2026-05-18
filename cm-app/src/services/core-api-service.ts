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

export function getAllProjects(offset = 0, limit = 200) {
  return http.get(
    `${getApiEndpoint()}/projects?offset=${offset}&limit=${limit}`
  );
}

export async function getAllProjectsPaginated(): Promise<unknown[]> {
  const limit = 200;
  let offset = 0;
  const allResults: unknown[] = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data } = await getAllProjects(offset, limit);
    const results = data.results || [];
    allResults.push(...results);
    if (results.length < limit || allResults.length >= (data.total ?? Infinity)) {
      break;
    }
    offset += limit;
  }
  return allResults;
}

export function getPerson(uuid: string) {
  return http.get(`${getApiEndpoint()}/people/${uuid}?as_self=true`);
}
