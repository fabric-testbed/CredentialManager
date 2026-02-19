export default function clearLocalStorage() {
  localStorage.removeItem("idToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("cmUserID");
  localStorage.removeItem("cmUserStatus");
}
