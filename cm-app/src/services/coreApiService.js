import http from './httpService';
import { default as configData } from "../config.json";

const apiEndpoint = configData.fabricCoreApiUrl;

export function getWhoAmI(){
  return http.get(`${apiEndpoint}/whoami`);
}

export function getProjects() {
  const userID = localStorage.getItem("cmUserID");
  return http.get(`${apiEndpoint}/projects?offset=0&limit=20&person_uuid=${userID}`);
}
