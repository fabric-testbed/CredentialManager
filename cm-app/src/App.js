import React from "react";
import Header from "./components/Header";
import Homepage from './pages/Homepage';
import CredentialManagerPage from './pages/CredentialManagerPage';
import Footer from "./components/Footer";
import "./styles/App.scss";
import { getWhoAmI } from "./services/coreApiService";

class App extends React.Component {
  state = {
    userID: ""
  }

  async componentDidMount() {
    // if no user status info is stored, call UIS getWhoAmI.
    if (!localStorage.getItem("cmUserID") || localStorage.getItem("cmUserID") === "") {
      try {
        const { data } = await getWhoAmI();
        const user = data.results[0];
        localStorage.setItem("cmUserID", user.uuid);
        this.serState({ userID: user.uuid });
      } catch (err) {
        console.log("/whoami " + err);
      }
    }
  }

  render() {
    const { userID } = this.state;
    return (
        <div className="App">
          <Header userID={userID} />
          {
            userID !== "" ? <CredentialManagerPage /> : <Homepage />
          }
          <Footer />
        </div>
      );
    }
  }

export default App;
