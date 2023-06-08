import React from "react";
import Form from 'react-bootstrap/Form';
import Card from 'react-bootstrap/Card';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Alert from 'react-bootstrap/Alert';
import { createIdToken, refreshToken, revokeToken } from "../services/credentialManagerService.js";
import { getProjects } from "../services/coreApiService.js";
import { default as externalLinks } from "../services/externalLinks.json";
import checkCmAppType from "../utils/checkCmAppType";
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
    selectedCreateProject: "",
    selectedRefreshProject: "",
  }

  portalLinkMap = {
    "alpha": externalLinks.portalLinkAlpha,
    "beta": externalLinks.portalLinkBeta,
    "production": externalLinks.portalLinkProduction,
  }

  async componentDidMount(){
    try {
      const { data: res } = await getProjects(localStorage.getItem("cmUserID"));
      const projects = res.results;
      this.setState({ projects });
      if (projects.length > 0) {
        this.setState({ selectedCreateProject: projects[0].uuid, selectedRefreshProject: projects[0].uuid });
      }
    } catch (ex) {
      toast.error("Failed to load user's project information. Please reload this page.");
    }
  }

  createToken = async (e) => {
    e.preventDefault();

    try {
      const project = this.state.selectedCreateProject;
      const scope = this.state.selectedCreateScope;
      const { data: res } = await createIdToken(project, scope);
      this.setState({ createCopySuccess: false, createSuccess: true });
      this.setState({ createToken: JSON.stringify(res["data"][0], undefined, 4) });
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
      this.setState({ refreshCopySuccess: false, refreshSuccess: true });
      this.setState({ refreshToken: JSON.stringify(res["data"][0], undefined, 4) });
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
      createCopySuccess, refreshToken, refreshSuccess, refreshCopySuccess, revokeSuccess  } = this.state;
    
    const portalLink = this.portalLinkMap[checkCmAppType()];

    return (
      <div className="container">
        { 
          projects.length === 0 &&
            <div className="alert alert-warning mt-4" role="alert">
              <p className="mt-2">To manage tokens, you have to be in a project first:</p>
              <p>
                <ul>
                  <li>
                    If you are a <a href={externalLinks.learnArticleStarterQuestions} target="_blank" rel="noreferrer">professor or research staff member at your institution</a>, 
                    please <a href={portalLink} target="_blank" rel="noreferrer">request to be FABRIC Project Lead</a> from FABRIC Portal -&gt; User Profile -&gt; My Roles &amp; Projects page then you can create a project.
                  </li>
                  <li>
                    If you are a <a href={externalLinks.learnArticleStarterQuestions} target="_blank" rel="noreferrer">student or other contributor</a>, 
                    please ask your project lead to add you to a project.
                  </li>
                </ul>
              </p>
            </div>
        }
        { 
          projects.length > 0 && <div>
            <div className="alert alert-primary mb-2" role="alert">
            Please consult &nbsp;
            <a
              href={externalLinks.learnArticleFabricTokens}
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
                <Form.Group>
                  <Form.Label>Select Project</Form.Label>
                  <Form.Control as="select" onChange={this.handleSelectCreateProject}>
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
                <Form.Group>
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
                  disabled={createSuccess}
                  onClick={e => this.createToken(e)}
                >
                  Create Token
                </button>
              </Col>
            </Row>
            { createSuccess && (
              <div className="mt-2">
                <Card>
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
                    <Form.Group>
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
                <div className="alert alert-warning mb-2" role="alert">
                  If you need to use multiple tokens in parallel in e.g. separate API sessions, please log out and log back in to generate new tokens.
                </div>
              </div>
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
                <Form.Group>
                  <Form.Label>Select Project</Form.Label>
                  <Form.Control as="select" onChange={this.handleSelectRefreshProject}>
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
                <Form.Group>
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
                  <Form.Group>
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
                <Form.Group>
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
          {
            refreshCopySuccess && (
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
                <Form.Group>
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
        }
      </div>
    )
  }
}

export default CredentialManagerPage;