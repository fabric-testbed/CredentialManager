import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Header from "./components/Header";
import Home from './pages/Home';
import CredentialManagerPage from './pages/CredentialManagerPage';
import Footer from "./components/Footer";
import { getWhoAmI } from "./services/coreApiService.js";
import { toast, ToastContainer } from "react-toastify";
import SessionTimeoutModal from "./components/Modals/SessionTimeoutModal";
import { default as cmData } from "./services/cmData.json";
import 'react-toastify/dist/ReactToastify.css';
import "./styles/App.scss";

class App extends React.Component {
  state = {
    cmUserStatus: "",
    showSessionTimeoutModal1: false,
    showSessionTimeoutModal2: false,
  }

  async componentDidMount() {
    if (!localStorage.getItem("cmUserStatus")) {
      try {
        const { data } = await getWhoAmI();
        const user = data.results[0];
        if (user.enrolled) {
          localStorage.setItem("cmUserID", user.uuid);
          localStorage.setItem("cmUserStatus", "active");
          try {
            // after user logs in for 3hr55min, pop up first session time-out modal
            const sessionTimeoutInterval1 = setInterval(() =>
              this.setState({showSessionTimeoutModal1: true})
            , cmData["5minBeforeCookieExpires"]);

            // after user logs in for 3hr59min, pop up second session time-out modal
            const sessionTimeoutInterval2 = setInterval(() => {
              this.setState({
                showSessionTimeoutModal1: false,
                showSessionTimeoutModal2: true,
              })
            }, cmData["1minBeforeCookieExpires"]);

            localStorage.setItem("sessionTimeoutInterval1", sessionTimeoutInterval1);
            localStorage.setItem("sessionTimeoutInterval2", sessionTimeoutInterval2);
          } catch (err) {
            console.log("Failed to get current user's information.");
          }
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
    const { cmUserStatus, showSessionTimeoutModal1, showSessionTimeoutModal2 } = this.state;

    return (
        <div className="App">
          <Router>
            <Header cmUserStatus={cmUserStatus} />
              {
                showSessionTimeoutModal1 &&
                <SessionTimeoutModal
                  modalId={1}
                  timeLeft={300000}
                />
              }
              {
                showSessionTimeoutModal2 &&
                <SessionTimeoutModal
                  modalId={2}
                  timeLeft={60000}
                />
              }
            <Routes>
              <Route path="/" element={<Home cmUserStatus={cmUserStatus} />} />
              <Route path="/login" element={<Home cmUserStatus={cmUserStatus} />} />
              <Route path="/logout" element={<Home cmUserStatus={cmUserStatus} />} />
              <Route path="/cm" element={<CredentialManagerPage cmUserStatus={cmUserStatus}/>} />
            </Routes>
            <Footer />
            <ToastContainer 
              position="top-right"
              autoClose={5000}
              hideProgressBar={false}
              newestOnTop={false}
              closeOnClick
              rtl={false}
              pauseOnFocusLoss
              draggable
              pauseOnHover
              theme="colored"
            />
          </Router>
        </div>
      );
    }
  }

export default App;
