export default function clearLocalStorage() {
  sessionStorage.removeItem("idToken");
  sessionStorage.removeItem("refreshToken");
  sessionStorage.removeItem("cmUserID");
  sessionStorage.removeItem("cmUserStatus");
}
