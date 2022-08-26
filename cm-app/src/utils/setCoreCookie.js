import { hasCookie } from "./hasCookie";
import sleep from "./sleep";

function getCookieValue(cookieName) {
  let name = cookieName + "=";
  let decodedCookie = decodeURIComponent(document.cookie);
  let ca = decodedCookie.split(';');
  for(let i = 0; i <ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') {
      c = c.substring(1);
    }
    if (c.indexOf(name) === 0) {
      return c.substring(name.length, c.length);
    }
  }
  return "";
}

export async function setCoreCookie(cookiename) {
  const coreCookieName = cookiename.substring(0, cookiename.length - 3);
  console.log(coreCookieName)
  if (hasCookie(coreCookieName)) { return; }
  
  await sleep(150);

  const cookieValue = getCookieValue(cookiename)

  var d = new Date();
  // number of minutes until jwt expires: 240
  d.setTime(d.getTime() + (14400000));
  var expires = "expires=" + d.toUTCString();
  
  // set a cookie with the same value
  document.cookie = `${coreCookieName}=${cookieValue};domain=fabric-testbed.net;path=/;${expires}`;
}