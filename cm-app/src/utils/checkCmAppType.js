export default function checkCmAppType(url) {
  // decide current portal is alpha, beta or production.
  if (url.includes("alpha")) {
    return "alpha";
  }

  if (url.includes("beta")) {
    return "beta";
  }

  return "production";
}
