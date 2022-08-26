import React from "react";
import { BrowserRouter as Router } from "react-router-dom";
import Header from "./components/Header";
import Homepage from './pages/Homepage';
import CredentialManagerPage from './pages/CredentialManagerPage';
import Footer from "./components/Footer";
import "./styles/App.scss";
import { hasAuthCookie } from "./utils/checkAuthCookie";
import { checkCmAppType } from "./utils/checkCmAppType";
import { default as configData } from "config.json";
import { toast } from "react-toastify";

class App extends React.Component {
  state = {
    isAuthenticated: false
  }

  async componentDidMount() {
    // check if auth cookie exists
    const appType = checkCmAppType(window.location.href);
    const authCookieName = configData.authCookieName[appType];
    const isAuthenticated = hasAuthCookie(authCookieName)
    this.setState({ isAuthenticated });

    if(isAuthenticated) {
      // set user id.
      try {
        const { data } = await getWhoAmI();
        const user = data.results[0];
        localStorage.setItem("cmUserID", user.uuid);
      } catch (err) {
        toast.error("Failed to load user information.")
      }
    }
  }

  render() {
    const { isAuthenticated } = this.state;
    return (
        <div className="App">
          <Router>
            <Header isAuthenticated={isAuthenticated} />
            {
              isAuthenticated !== "" ? <CredentialManagerPage /> : <Homepage />
            }
            <Footer />
          </Router>
        </div>
      );
    }
  }

export default App;
