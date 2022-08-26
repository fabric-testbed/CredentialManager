import axios from "axios";
import { toast } from "react-toastify";

axios.defaults.withCredentials = true;

axios.interceptors.response.use(null, (error) => {
    if (error.response && error.response.status === 401) {
      // no auth cookie or cookie is expired.
      window.location.href = "/logout";

      // do not toast error message.
      return Promise.reject(error);
    }

    // Timeout error.
    if(error.code === 'ECONNABORTED') {
      toast.error("Request timeout. Please try again.");
      return Promise.reject(error); 
    }
  
    if (error.response && error.response.data 
      && error.response.data.errors && error.response.data.errors.length > 0) {
        for (const err of error.response.data.errors) {
          // console log and toast the human-readable error details.
          console.log(`ERROR: ${err.details}`);
          toast.error(err.details);
        }
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