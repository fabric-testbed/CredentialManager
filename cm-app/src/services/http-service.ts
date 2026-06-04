import axios from "axios";
import { toast } from "sonner";

axios.defaults.withCredentials = true;

axios.interceptors.response.use(null, (error) => {
  if (error.response && error.response.status === 401) {
    const isCookieExpired = sessionStorage.getItem("cmUserStatus") === "active";

    const errors = error.response.data?.errors;

    if (errors && errors[0]?.details?.includes("Login required")) {
      sessionStorage.setItem("cmUserStatus", "unauthorized");
      sessionStorage.removeItem("userID");
    }

    if (errors && errors[0]?.details?.includes("Enrollment required")) {
      sessionStorage.setItem("cmUserStatus", "inactive");
    }

    if (isCookieExpired) {
      sessionStorage.removeItem("cmUserID");
      sessionStorage.removeItem("cmUserStatus");
      window.location.href = "/logout";
    }

    return Promise.reject(error);
  }

  if (error.code === "ECONNABORTED") {
    toast.error("Request timeout. Please try again.");
    return Promise.reject(error);
  }

  if (error.response?.data?.detail) {
    console.log(`ERROR: ${error.response.data.detail}`);
    toast.error(error.response.data.detail);
  }

  return Promise.reject(error);
});

const httpServices = {
  get: axios.get,
  post: axios.post,
  put: axios.put,
  delete: axios.delete,
  patch: axios.patch,
};

export default httpServices;
