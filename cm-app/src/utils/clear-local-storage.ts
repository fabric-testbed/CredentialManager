export default function clearLocalStorage() {
  sessionStorage.removeItem("idToken");
  sessionStorage.removeItem("refreshToken");
  sessionStorage.removeItem("cmUserID");
  sessionStorage.removeItem("cmUserStatus");
  // Whether this person may administer storage. User-scoped, so it cannot leak
  // between accounts, but there is no reason to keep it past a logout.
  for (const k of Object.keys(sessionStorage)) {
    if (k.startsWith("cmStorageOperator:")) sessionStorage.removeItem(k);
  }
}
