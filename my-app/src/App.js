import React from "react";
import { BrowserRouter as Router } from "react-router-dom";
import Header from "./components/Header";
import Homepage from './pages/Homepage';
import CredentialManagerPage from './pages/CredentialManagerPage';
import Footer from "./components/Footer";
import "./styles/App.scss";
import { getWhoAmI } from "./services/coreApiService";

class App extends React.Component {
  state = {
    cmUserStatus: "inactive",
  };

  async componentDidMount() {
    // if no user status info is stored, call UIS getWhoAmI.
    if (!localStorage.getItem("cmUserStatus")) {
      try {
        const { data } = await getWhoAmI();
        const user = data.results[0];
        localStorage.setItem("cmUserID", user.uuid);
        localStorage.setItem("cmUserStatus", "active");
      } catch (err) {
        console.log("/whoami " + err);
      }
    }

    this.setState({ userStatus: localStorage.getItem("cmUserStatus") });
  }

  render() {
    const { cmUserStatus } = this.state;
    return (
        <div className="App">
          <Router>
            <Header cmUserStatus={this.state.cmUserStatus} />
            { cmUserStatus !== "active" && <Homepage /> }
            { cmUserStatus === "active" && <CredentialManagerPage />}
            <Footer />
          </Router>
        </div>
      );
    }
  }

export default App;
