import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Header from "./components/Header";
import Home from './pages/Home';
import CredentialManagerPage from './pages/CredentialManagerPage';
import Footer from "./components/Footer";
import "./styles/App.scss";
import { getWhoAmI } from "./services/coreApiService.js";
import { toast } from "react-toastify";

class App extends React.Component {
  state = {
    cmUserStatus: ""
  }

  async componentDidMount() {
    if (!localStorage.getItem("cmUserStatus")) {
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
          localStorage.setItem("cmUserStatus", "unauthorized");
      }
    }

    this.setState({ cmUserStatus: localStorage.getItem("cmUserStatus") });
  }

  render() {
    const { cmUserStatus } = this.state;

    return (
        <div className="App">
          <Router>
            <Header cmUserStatus={cmUserStatus} />
            <Routes>
              <Route path="/" element={<Home cmUserStatus={cmUserStatus} />} />
              <Route path="/login" element={<Home cmUserStatus={cmUserStatus} />} />
              <Route path="/logout" element={<Home cmUserStatus={cmUserStatus} />} />
              <Route path="/cm" element={<CredentialManagerPage cmUserStatus={cmUserStatus}/>} />
            </Routes>
            <Footer />
          </Router>
        </div>
      );
    }
  }

export default App;
