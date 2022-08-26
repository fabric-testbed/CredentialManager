import { hasCookie } from "./hasCookie";

function getCookieByName(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
}

export function setCoreCookie(cookiename) {
  const coreCookieName = cookiename.substring(0, cookiename.length - 3);

  if (hasCookie(coreCookieName)) { return; }
  
  const cookieValue = getCookieByName(cookiename);
  var d = new Date();
  d.setTime(d.getTime() + (3600000));
  var expires = "expires=" + d.toUTCString();
  
  // set a cookie with the same value
  document.cookie = `${coreCookieName}=${cookieValue};domain=fabric-testbed.net;path=/;${expires}`;
}