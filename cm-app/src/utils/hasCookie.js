export function hasCookie(cookiename) {
  var d = new Date();
  d.setTime(d.getTime() + (1000));
  var expires = "expires=" + d.toUTCString();
  
  // set a cookie with the same name of http-only cookie
  document.cookie = cookiename + "=new_value;domain=fabric-testbed.net;path=/;" + expires;
  
  // if cannot set, then http-only cookie of the same name exists
  return document.cookie.indexOf(cookiename + '=') === -1;
}