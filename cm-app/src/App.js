import React from "react";
import { BrowserRouter as Router } from "react-router-dom";
import Header from "./components/Header";
import Homepage from './pages/Homepage';
import CredentialManagerPage from './pages/CredentialManagerPage';
import Footer from "./components/Footer";
import "./styles/App.scss";
import { getWhoAmI } from "./services/coreApiService";
import checkCmAppType from "./utils/checkCmAppType";
import { hasCookie } from "./utils/hasCookie";
import { default as configData } from "./config.json";
import { toast } from "react-toastify";

class App extends React.Component {
  state = {
    isAuthenticated: false
  }

  async componentDidMount() {
    // check if auth cookie exists
    const appType = checkCmAppType();
    const authCookieName = configData.authCookieName[appType];
    const isAuthenticated = hasCookie(authCookieName)
    this.setState({ isAuthenticated });
  }

  render() {
    const { isAuthenticated } = this.state;
    return (
        <div className="App">
          <Router>
            <Header isAuthenticated={isAuthenticated} />
            {
              isAuthenticated ? <CredentialManagerPage /> : <Homepage />
            }
            <Footer />
          </Router>
        </div>
      );
    }
  }

export default App;
