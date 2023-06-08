import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Header from "./components/Header";
import CredentialManagerPage from './pages/CredentialManagerPage';
import Home from './pages/Home';
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
          const errors = err.response.data.errors;

          if (errors && errors[0].details.includes("Login required")) {
            localStorage.setItem("cmUserStatus", "unauthorized");
            localStorage.removeItem("cmUserID");
          }
    
          if (errors && errors[0].details.includes("Enrollment required")) {
            localStorage.setItem("cmUserStatus", "inactive");
          }
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
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Home />} />
              <Route path="/logout" element={<Home />} />
              <Route path="/cm" element={<CredentialManagerPage />} />
            </Routes>
            <Footer />
          </Router>
        </div>
      );
    }
  }

export default App;
