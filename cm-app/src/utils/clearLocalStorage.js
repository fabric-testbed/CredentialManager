export default function clearLocalStorage() {
  // clear Local Storage when user logs out.
  // remove old user status stored in browser.
  localStorage.removeItem("idToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("cmUserID");
  localStorage.removeItem("cmUserStatus");
  localStorage.removeItem("countdownTimerIntervalId");
  localStorage.removeItem("sessionTimeoutIntervalId1");
  localStorage.removeItem("sessionTimeoutIntervalId2");
}