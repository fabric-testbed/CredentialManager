import http from './httpService';
import { default as configData } from "../config.json";
import checkCmAppType from "../utils/checkCmAppType";

const apiEndpoint = configData.fabricCoreApiUrl[checkCmAppType()];

export function getWhoAmI(){
  return http.get(`${apiEndpoint}/whoami`);
}

export function getProjects(userID) {
  return http.get(`${apiEndpoint}/projects?offset=0&limit=200&person_uuid=${userID}`);
}
