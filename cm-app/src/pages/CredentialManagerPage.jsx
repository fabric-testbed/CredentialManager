import React from "react";
import Form from 'react-bootstrap/Form';
import Card from 'react-bootstrap/Card';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Button from 'react-bootstrap/Button';
import Alert from 'react-bootstrap/Alert';

import { createIdToken, refreshToken, revokeToken } from "../services/credentialManagerService.js";
import { getProjects } from "../services/coreApiService.js";

import { toast } from "react-toastify";

class CredentialManagerPage extends React.Component {
  state = {
    projects: [],
    createToken: "",
    refreshToken: "",
    createSuccess: false,
    createCopySuccess: false,
    refreshSuccess: false,
    refreshCopySuccess: false,
    revokeSuccess: false,
    scopeOptions: [
      { id: 1, value: "all", display: "All"},
      { id: 2, value: "cf", display: "Control Framework"},
      { id: 3, value: "mf", display: "Measurement Framework"},
    ],
    selectedCreateScope: "all",
    selectedRefreshScope: "all",
    selectedCreateProject: "all",
    selectedRefreshProject: "all",
  }

  async componentDidMount(){
    try {
      const { data: res } = await getProjects();
      this.setState({ projects: res.results });
    } catch (ex) {
      toast.error("Failed to load user's project information. Please reload this page.");
      console.log("Failed to load user information: " + ex.response.data);
    }
  }

  generateTokenJson = (id_token, refresh_token) => {
    const today = new Date();
    const date = today.getFullYear()+'-'+(today.getMonth()+1)+'-'+today.getDate();
    const time = today.getHours()+':'+today.getMinutes()+':'+today.getSeconds();
    const time_stamp = date + ' '+ time;

    const res_json = {
      "created_at" : time_stamp,
      "id_token": id_token,
      "refresh_token": refresh_token,
    };
    
    return JSON.stringify(res_json, undefined, 4);
  }

  createToken = async (e) => {
    e.preventDefault();

    try {
      const project = this.state.selectedCreateProject;
      const scope = this.state.selectedCreateScope;
      const { data: res } = await createIdToken(project, scope);
      const token = res["data"][0];
      this.setState({ createCopySuccess: false, createSuccess: true });
      this.setState({ createToken: this.generateTokenJson(token.id_token, token.refresh_token) });
    } catch (ex) {
      toast.error("Failed to create token.");
    }
  }

  refreshToken = async (e) => {
    e.preventDefault();

    try {
      const project = this.state.selectedRefreshProject;
      const scope = this.state.selectedRefreshScope;
      const { data: res } = await refreshToken(project, scope, document.getElementById('refreshTokenTextArea').value);
      const token = res["data"][0];
      this.setState({ refreshCopySuccess: false, refreshSuccess: true });
      this.setState({ refreshToken: this.generateTokenJson(token.id_token, token.refresh_token) });
    }
    catch (ex) {
      this.setState({ refreshSuccess: false });
      toast.error("Failed to refresh token.")
    }
  }

  revokeToken = async (e) => {
    e.preventDefault();
    
    try {
      await revokeToken(document.getElementById('revokeTokenTextArea').value);
      this.setState({ revokeSuccess: true });
    }
    catch (ex) {
      this.setState({ revokeSuccess: false });
      toast.error("Failed to revoke token.")
    }
  }

  copyToken = (e, option) => {
    e.preventDefault();
    document.getElementById(`${option}TokenTextArea`).select();
    document.execCommand('copy');
    e.target.focus();
    if (option === "create") {
      this.setState({ createCopySuccess: true });
    }
    if (option === "refresh") {
      this.setState({ refreshCopySuccess: true });
    }
  }

  downloadToken = (e, option) => {
    e.preventDefault();
    const element = document.createElement("a");
    const file = new Blob([document.getElementById(`${option}TokenTextArea`).value], {type: 'application/json'});
    element.href = URL.createObjectURL(file);
    element.download = "id_token.json";
    document.body.appendChild(element); // Required for this to work in FireFox
    element.click();
  }

  handleSelectCreateProject = (e) =>{
    this.setState({ selectedCreateProject: e.target.value });
  }

  handleSelectRefreshProject = (e) =>{
    this.setState({ selectedRefreshProject: e.target.value });
  }


  handleSelectCreateScope = (e) =>{
    this.setState({ selectedCreateScope: e.target.value });
  }

  handleSelectRefreshScope = (e) =>{
    this.setState({ selectedRefreshScope: e.target.value });
  }

  render() {
    const { projects, scopeOptions, createSuccess, createToken,
      createCopySuccess, refreshToken, refreshSuccess, revokeSuccess  } = this.state;
    return (
      <div className="container">
        <div className="alert alert-primary mb-2" role="alert">
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
        <h2 className="mb-4">Create Token</h2>
        <Form>
          <Row>
            <Col>
              <Form.Group controlId="exampleForm.ControlSelect1">
                <Form.Label>Select Project</Form.Label>
                <Form.Control as="select" onChange={this.handleSelectCreateProject}>
                  <option value="all">All</option>
                  {
                    projects.length > 0 && projects.map(project => {
                      return (
                        <option value={project.uuid}>{project.name}</option>
                      )
                    })
                  }
                </Form.Control>
              </Form.Group>
            </Col>
            <Col>
              <Form.Group controlId="exampleForm.ControlSelect1">
                <Form.Label>Select Scope</Form.Label>
                <Form.Control as="select" onChange={this.handleSelectCreateScope}>
                  { 
                    scopeOptions.map(option => {
                      return (
                        <option
                          id={`createTokenScope${option.id}`}
                          value={option.value}
                        >
                          {option.display}
                        </option>
                      )
                    })
                  }
                </Form.Control>
              </Form.Group>
            </Col>
            <Col xs={2} className="d-flex flex-row align-items-center justify-content-end">
              <button
                className="btn btn-outline-success mt-3"
                onClick={e => this.createToken(e)}
              >
                Create Token
              </button>
            </Col>
          </Row>
          { createSuccess && (
            <Card className="mt-2">
              <Card.Header className="d-flex flex-row bg-light">
                <button
                  onClick={e => this.copyToken(e, "create")}
                  className="btn btn-sm btn-outline-primary mr-2"
                >
                  Copy
                </button>
                <button
                  onClick={e => this.downloadToken(e, "create")}
                  className="btn btn-sm btn-outline-primary"
                >
                  Download
                </button>
              </Card.Header>
              <Card.Body>
                <Form.Group controlId="exampleForm.ControlTextarea1">
                  <Form.Control
                    ref={(textarea) => this.textArea = textarea}
                    as="textarea"
                    id="createTokenTextArea"
                    defaultValue={createToken}
                    rows={6}
                  />
                </Form.Group>
              </Card.Body>
            </Card>
          )}
          {createCopySuccess && (
            <Alert variant="success">
              Copied to clipboard successfully!
            </Alert>
          )}
        </Form>
        <h2 className="my-4">Refresh Token</h2>
        <Form>
          <Row>
            <Col>
              <Form.Group controlId="exampleForm.ControlSelect1">
                <Form.Label>Select Project</Form.Label>
                <Form.Control as="select" onChange={this.handleSelectRefreshProject}>
                  <option value="all">All</option>
                  {
                    projects.map(project => {
                      return (
                        <option value={project.uuid}>{project.name}</option>
                      )
                    })
                  }
                </Form.Control>
              </Form.Group>
            </Col>
            <Col>
              <Form.Group controlId="exampleForm.ControlSelect1">
                <Form.Label>Select Scope</Form.Label>
                <Form.Control as="select" onChange={this.handleSelectRefreshScope}>
                 { 
                    scopeOptions.map(option => {
                      return (
                        <option
                          id={`createTokenScope${option.id}`}
                          value={option.value}
                        >
                          {option.display}
                        </option>
                      )
                    })
                  }
                </Form.Control>
              </Form.Group>
            </Col>
          </Row>
          {!refreshSuccess && (
            <Card className="mt-2">
              <Card.Header className="d-flex bg-light">
                Input the refresh token value:
              </Card.Header>
              <Card.Body>
                <Form.Group controlId="exampleForm.ControlTextarea1">
                  <Form.Control
                  as="textarea"
                  rows={3}
                  id="refreshTokenTextArea"
                />
                </Form.Group>
              </Card.Body>
            </Card>
          )}
          {refreshSuccess && (
            <Card>
            <Card.Header className="d-flex flex-row bg-light">
              <button
                onClick={e => this.copyToken(e, "refresh")}
                className="btn btn-sm btn-outline-primary mr-2"
              >
                Copy
              </button>
              <button
                onClick={e => this.downloadToken(e, "refresh")}
                className="btn btn-sm btn-outline-primary"
              >
                Download
              </button>
            </Card.Header>
            <Card.Body>
              <Form.Group controlId="exampleForm.ControlTextarea1">
                <Form.Control
                  ref={(textarea) => this.textArea = textarea}
                  as="textarea"
                  id="refreshTokenTextArea"
                  defaultValue={refreshToken}
                  rows={6}
                />
              </Form.Group>
            </Card.Body>
          </Card>
        )}
        {refreshSuccess && createCopySuccess && (
          <Alert variant="success">
            Copied to clipboard successfully!
          </Alert>
        )}
        </Form>
        {
          !refreshSuccess && (
            <button
              className="btn btn-outline-success mt-3"
              onClick={e => this.refreshToken(e)}
            >
              Refresh Token
            </button>
          )
        }
        <h2 className="my-4">Revoke Token</h2>
          <Card>
            <Card.Header className="d-flex bg-light">
              Paste the refresh token to revoke:
            </Card.Header>
            <Card.Body>
              <Form.Group controlId="exampleForm.ControlTextarea1">
                <Form.Control
                  as="textarea"
                  rows={3}
                  id="revokeTokenTextArea"
                  onChange={this.changeRevokeToken}
                />
              </Form.Group>
            </Card.Body>
          </Card>
          {revokeSuccess && (
            <Alert variant="success">
              The token is revoked successfully!
            </Alert>
          )}
        <button
          className="btn btn-outline-danger mt-3"
          onClick={e => this.revokeToken(e)}
        >
          Revoke Token
        </button>
      </div>
    )
  }
}

export default CredentialManagerPage;