import React from "react";
import { NavLink } from "react-router-dom";
import logo from "../imgs/fabric-brand.png";

class Header extends React.Component {
  handleLogin = () => {
      // remove old user id stored in browser if there is any.
      localStorage.removeItem("cmUserID");
      // nginx handle login url.
      window.location.href = "/login";
  }


  handleLogout = () => {
    localStorage.removeItem("cmUserID");
    // nginx handle logout url.
    window.location.href = "/logout";
  }

  render() {
    return (
      <nav className="navbar navbar-expand-lg navbar-light bg-light p-2 d-flex flex-row justify-content-between">
        <NavLink className="navbar-brand" to="/">
          <img
            src={logo}
            width="70"
            height="30"
            className="d-inline-block align-top"
            alt=""
          />
          FABRIC Credential Manager
        </NavLink>
        <div className="ml-auto">
          { 
            !this.props.isAuthenticated ? 
            <form className="form-inline my-2 my-lg-0">
              <NavLink to="/login">
                <button
                  onClick={this.handleLogin}
                  className="btn btn-outline-success my-2 my-sm-0 mr-2"
                >
                  Log in
                </button>
              </NavLink>
            </form> :
            <form className="form-inline my-2 my-lg-0">
              <NavLink to="/logout">
                <button
                  onClick={this.handleLogout}
                  className="btn btn-outline-success my-2 my-sm-0"
                >
                  Log out
                </button>
              </NavLink>
            </form>
          }
        </div>
      </nav>
    );
  }
}

export default Header;
