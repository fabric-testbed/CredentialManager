export default function checkCmAppType() {
  // decide current portal is alpha, beta or production.
  if (window.location.href.includes("alpha")) {
    return "alpha";
  }

  if (window.location.href.includes("beta")) {
    return "beta";
  }

  return "production";
}
