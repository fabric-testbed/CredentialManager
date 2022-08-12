import React from "react";
import logo from "../imgs/fabric-brand.png";

class Homepage extends React.Component {
  handleLogin = () => {
    // remove old user status stored in browser if there is any.
    localStorage.removeItem("cmUserStatus");
    // nginx handle login url.
    window.location.href = "/login";
  }

  render() {
    return (
      <div className="container d-flex flex-column align-items-center p-4">
       <h1>
         FABRIC Credential Manager
       </h1>
       <img
          src={logo}
          width="490"
          height="210"
          className="d-inline-block align-top my-4"
          alt=""
        />
       <div className="alert alert-primary mb-4" role="alert">
          Please consult &nbsp;
          <a
            href="https://learn.fabric-testbed.net/knowledge-base/obtaining-and-using-fabric-api-tokens/"
            target="_blank"
            rel="noreferrer"
          >
            <b>this guide</b>
          </a>&nbsp;
          for obtaining and using FABRIC API tokens.
        </div>
        <button
          className="btn btn-outline-success"
          onClick={this.handleLogin}
        >
          Login
        </button>
      </div>
    )
  }
}

export default Homepage;