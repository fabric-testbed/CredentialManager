import React from "react";
import logo from "../imgs/fabric-brand.png";
import CredentialManagerPage from "./CredentialManagerPage";

class Home extends React.Component {
  render() {
    if (this.props.cmUserStatus !== "active") {
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
            alt="FABRIC Logo"
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
        </div>
      )
    } else {
      return <CredentialManagerPage cmUserStatus={this.props.cmUserStatus} />
    }
  }
}

export default Home;