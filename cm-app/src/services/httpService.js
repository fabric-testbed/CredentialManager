import axios from "axios";
import { toast } from "react-toastify";

axios.defaults.withCredentials = true;

axios.interceptors.response.use(null, (error) => {
    if (error.response && error.response.status === 401) {
      // 1. the user has not logged in
      // set status to unauthorized
      localStorage.setItem("cmUserID", "");

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