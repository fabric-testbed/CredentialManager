import axios from "axios";
import { toast } from "react-toastify";

axios.defaults.withCredentials = true;
// set timeout to be 20 seconds
// axios.defaults.timeout = 20000;

axios.interceptors.response.use(null, (error) => {
    if (error.response && error.response.status === 401) {
      // 1. the user has not logged in
      // 2. or the auth cookie is expired
      const isCookieExpired = localStorage.getItem("userStatus", "active");
      // set status to unauthorized
      localStorage.setItem("userStatus", "unauthorized");
      localStorage.removeItem("userID");
      // if cookie expired, reload; 
      // otherwise the user is not logged in and no need to reload.
      if (isCookieExpired) {
        // removed local storage items.
        localStorage.removeItem("idToken");
        localStorage.removeItem("refreshToken");
        // reload the page.
        window.location.reload();
      }
      // do not toast error message.
      return Promise.reject(error);
    }

    if (error.response && error.response.status === 403) {
      // the user has logged in but hasn't completed self-signup yet
      // do not toast error message.
      return Promise.reject(error); 
    }

    // Timeout error.
    if(error.code === 'ECONNABORTED') {
      toast.error("Request timeout. Please try again.");
      return Promise.reject(error); 
    }
  
    if (error.response && error.response.data) {
      // toast the error message of x-error.
      toast.error(error.response.data);
    }

    return Promise.reject(error); 
  }
);

const httpServices = {
  get: axios.get,
  post: axios.post,
  put: axios.put,
  delete: axios.delete,
  patch: axios.patch
}

export default httpServices;