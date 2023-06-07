import React from "react";
import { BrowserRouter as Router } from "react-router-dom";
import Header from "./components/Header";
import Homepage from './pages/Homepage';
import CredentialManagerPage from './pages/CredentialManagerPage';
import Footer from "./components/Footer";
import "./styles/App.scss";
import checkCmAppType from "./utils/checkCmAppType";
import { hasCookie } from "./utils/hasCookie";
import { getWhoAmI } from "./services/coreApiService.js";
import { default as configData } from "./config.json";
import { toast } from "react-toastify";

class App extends React.Component {
  state = {
    isAuthenticated: false,
  }

  async componentDidMount() {
    try {
      const { data } = await getWhoAmI();
      const user = data.results[0];
      if (user.enrolled) {
        localStorage.setItem("cmUserID", user.uuid);
        localStorage.setItem("cmUserStatus", "active");
      } else {
        toast.error("Please enroll to FABRIC in the Portal first.");
      }
    } catch (err) {
        const errors = err.response.data.errors;

        if (errors && errors[0].details.includes("Login required")) {
          localStorage.setItem("cmUserStatus", "unauthorized");
          localStorage.removeItem("cmUserID");
        }
  
        if (errors && errors[0].details.includes("Enrollment required")) {
          localStorage.setItem("cmUserStatus", "inactive");
        }
    }

    this.setState({ isAuthenticated: localStorage.getItem("cmUserStatus") === "active" });
  }

  render() {
    const { isAuthenticated } = this.state;
    return (
        <div className="App">
          <Router>
            <Header isAuthenticated={isAuthenticated} />
            {
              isAuthenticated ? 
              <CredentialManagerPage /> : 
              <Homepage />
            }
            <Footer />
          </Router>
        </div>
      );
    }
  }

export default App;
