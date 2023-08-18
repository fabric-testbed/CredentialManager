import React from "react";
import Form from 'react-bootstrap/Form';
import Card from 'react-bootstrap/Card';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Alert from 'react-bootstrap/Alert';
import SpinnerWithText from "../components/SpinnerWithText.jsx";
import SpinnerFullPage from "../components/SpinnerFullPage.jsx";
import toLocaleTime from "../utils/toLocaleTime";
import { createIdToken, refreshToken, revokeToken, getTokenByProjectId, validateToken } from "../services/credentialManagerService.js";
import { getProjects } from "../services/coreApiService.js";
import { default as externalLinks } from "../services/externalLinks.json";
import checkCmAppType from "../utils/checkCmAppType";
import { toast } from "react-toastify";
import { OverlayTrigger, Tooltip } from 'react-bootstrap';

class CredentialManagerPage extends React.Component {
  state = {
    projects: [],
    createToken: "",
    refreshToken: "",
    tokenList: [],
    createSuccess: false,
    createCopySuccess: false,
    listSuccess: false,
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
    selectedListProject: "",
    validateTokenValue: "",
    isTokenValid: false,
    validateSuccess: false,
    revokeIdentitySuccess: false,
    revokedTokenHash: "",
    decodedToken: "",
    tokenMsg: "",
    inputLifetime: 4, // Default lifetime is 4 hours
    selectLifetimeUnit: "hours",
    createTokenComment: "Created via GUI", // Added comment for creating tokens,
    showFullPageSpinner: false,
    spinnerMessage: ""
  }

  portalLinkMap = {
    "alpha": externalLinks.portalLinkAlpha,
    "beta": externalLinks.portalLinkBeta,
    "production": externalLinks.portalLinkProduction,
  }

  async componentDidMount() {
      try {
        const { data: res } = await getProjects(localStorage.getItem("cmUserID"));
        const projects = res.results;
        this.setState({ projects });
        if (projects.length > 0) {
          const defaultProject = projects[0].uuid;
          this.setState({
            selectedCreateProject: defaultProject,
            selectedRefreshProject: defaultProject,
            selectedListProject: defaultProject
          }, () => {
            this.listTokens();
          });
        }
      } catch (ex) {
        toast.error("Failed to load user's project information. Please reload this page.");
      }
  }

  parseTokenLifetime = ()=> {
    const { inputLifetime: time, selectLifetimeUnit: unit } = this.state;
    if (unit === "hours") { return time; }
    if (unit === "days") { return time * 24; }
    if (unit === "weeks") { return time * 24 * 7; }
  }

  createToken = async (e) => {
    e.preventDefault();
    this.setState({ showFullPageSpinner: true, spinnerMessage: "Creating Token..."});
    try {
      const project = this.state.selectedCreateProject;
      const scope = this.state.selectedCreateScope;
      const lifetime = this.parseTokenLifetime(); // Added lifetime parameter
      const comment = this.state.createTokenComment; // Added comment for the token
      const { data: res } = await createIdToken(project, scope, lifetime, comment);
      console.log("Response received: " + res)
      this.setState({
        createCopySuccess: false,
        createSuccess: true.valueOf,
        createToken: JSON.stringify(res["data"][0], undefined, 4),
        showFullPageSpinner: false,
        spinnerMessage: ""
      });
      toast.success("Token created successfully.");
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
      console.log("Response received: " + res)
      this.setState({ refreshCopySuccess: false, refreshSuccess: true });
      this.setState({ refreshToken: JSON.stringify(res["data"][0], undefined, 4) });
      toast.success("Token refreshed successfully.");
    }
    catch (ex) {
      this.setState({ refreshSuccess: false });
      toast.error("Failed to refresh token.")
    }
  }

  revokeToken = async (e) => {
    e.preventDefault();

    try {
      await revokeToken("refresh", document.getElementById('revokeTokenTextArea').value);
      this.setState({ revokeSuccess: true });
    }
    catch (ex) {
      this.setState({ revokeSuccess: false });
      toast.error("Failed to revoke token.")
    }
  }

  revokeIdentityToken = async (e, tokenHash) => {
    e.preventDefault();

    try {
      const { data: res } = await revokeToken("identity", tokenHash);
      this.setState({ revokeIdentitySuccess: true, revokedTokenHash: tokenHash });
    }
    catch (ex) {
      this.setState({ revokeIdentitySuccess: false, revokedTokenHash: "" });
      toast.error("Failed to revoke token.")
    }
  }

  listTokens = async () => {
    try {
      const project = this.state.selectedListProject;
      const res = await getTokenByProjectId(project); // Assuming getTokenByProjectId returns an array of tokens
      this.setState({ listSuccess: true, tokenList: res.data.data, revokeIdentitySuccess: false, revokedTokenHash: "" });
    } catch (ex) {
      toast.error("Failed to get tokens.");
    }
  }

  validateToken = async (e) => {
    e.preventDefault();

    try {
      const { data: res } = await validateToken(this.state.validateTokenValue);
      this.setState({ validateSuccess: true, isTokenValid: true, decodedToken: res.token, tokenMsg: res.data[0].details });
    }
    catch (ex) {
      this.setState({ validateSuccess: true, isTokenValid: false, decodedToken: "" });
      toast.error("Failed to validate token.")
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

  handleSelectListProject = (e) => {
    this.setState({ selectedListProject: e.target.value }, () => {
      this.listTokens();
    });
  }

  handleSelectCreateScope = (e) =>{
    this.setState({ selectedCreateScope: e.target.value });
  }

  handleSelectRefreshScope = (e) =>{
    this.setState({ selectedRefreshScope: e.target.value });
  }

  handleSelectCreateLifetime = (e) => {
    this.setState({ inputLifetime: parseInt(e.target.value) });
  };

  handleLifetimeUnitChange = (e) => {
    this.setState({ selectLifetimeUnit: parseInt(e.target.value) });
  }

  handleCreateTokenComment = (e) => {
    this.setState({ createTokenComment: e.target.value });
  };

  render() {
    const { projects, scopeOptions, createSuccess, createToken, createCopySuccess, refreshToken, inputLifetime,
            refreshSuccess, refreshCopySuccess, revokeSuccess, listSuccess, tokenList, decodedToken, tokenMsg,
            validateTokenValue, isTokenValid, validateSuccess, revokeIdentitySuccess, revokedTokenHash,
            createTokenComment, showFullPageSpinner, showSpinner, spinnerMessage, selectLifetimeUnit } = this.state;

    const portalLink = this.portalLinkMap[checkCmAppType()];

    const renderTooltip = (id, content) => (
      <Tooltip id={id}>
        {content}
      </Tooltip>
    );

    if (showFullPageSpinner) {
      return (
        <div className="container">
          <SpinnerFullPage
            showSpinner={showFullPageSpinner}
            text={spinnerMessage}
          />
        </div>
      )
    }

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
              <Col xs={3}>
                <Form.Group>
                  <Form.Label>Select Project</Form.Label>
                  <Form.Select onChange={this.handleSelectCreateProject}>
                    {
                      projects.length > 0 && projects.map(project => {
                        return (
                          <option value={project.uuid}>{project.name}</option>
                        )
                      })
                    }
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col xs={2}>
                <Form.Group>
                  <Form.Label>
                    Lifetime
                    <OverlayTrigger
                      placement="right"
                      delay={{ show: 100, hide: 300 }}
                      overlay={renderTooltip("token-lifetime-tooltip", 
                      "The default token lifetime is 4 hours. If you have access to long-lived tokens, the lifetime limit is 9 weeks.")}
                    >
                      <i className="fa fa-question-circle text-secondary ml-2"></i>
                    </OverlayTrigger>
                  </Form.Label>
                  <Form.Control as="input" type="number" min="1" value={inputLifetime} onChange={this.handleSelectCreateLifetime} />
                </Form.Group>
              </Col>
              <Col xs={1}>
                <Form.Group>
                  <Form.Label></Form.Label>
                  <Form.Select onChange={this.handleLifetimeUnitChange}>
                    <option value={"hours"}>Hours</option>
                    <option value={"days"}>Days</option>
                    <option value={"weeks"}>Weeks</option>
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col xs={2}>
                <Form.Group>
                <Form.Label>Comment (optional)</Form.Label>
                <Form.Control as="input" type="text" value={createTokenComment} onChange={this.handleCreateTokenComment} />
              </Form.Group>
              </Col>
              <Col xs={2}>
                <Form.Group>
                  <Form.Label>Select Scope</Form.Label>
                  <Form.Select onChange={this.handleSelectCreateScope}>
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
                  </Form.Select>
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
          <h2 className="my-4">List Tokens</h2>
          <Form>
            <Row>
              <Col>
                <Form.Group>
                  <Form.Label>Select Project</Form.Label>
                  <Form.Select onChange={this.handleSelectListProject}>
                    {
                      projects.length > 0 && projects.map(project => {
                        return (
                          <option value={project.uuid}>{project.name}</option>
                        )
                      })
                    }
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>
          </Form>
          <div className="mt-1">
            {
              listSuccess && tokenList.length > 0 ?
              <table className="table table-striped table-bordered w-auto">
                <thead>
                  <tr>
                    <th>Token Hash</th>
                    <th>Comment</th>
                    <th>Created At</th>
                    <th>Expires At</th>
                    <th>State</th>
                    <th>From</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {
                    tokenList.map((token, index) => (
                      <tr key={index}>
                        <td className="col-md-3">{token['token_hash']}</td>
                        <td className="col-md-2">{token['comment']}</td>
                        <td className="col-md-2">{toLocaleTime(token['created_at'])}</td>
                        <td className="col-md-2">{toLocaleTime(token['expires_at'])}</td>
                        <td className="col-md-1">{token['state']}</td>
                        <td className="col-md-1">{token['created_from']}</td>
                        <td className="col-md-1">
                          {
                            token['state'] !== "Revoked" &&
                            <button
                              className="btn btn-sm btn-outline-danger"
                              onClick={e => this.revokeIdentityToken(e, token['token_hash'])}
                            >
                              Revoke
                            </button>
                          }
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table> 
              :
              <div className="alert alert-primary my-2">
                No tokens available for the selected project.
              </div>
            }
          </div>
          <h2 className="my-4">Refresh Token</h2>
          <Form>
            <Row>
              <Col>
                <Form.Group>
                  <Form.Label>Select Project</Form.Label>
                  <Form.Select onChange={this.handleSelectRefreshProject}>
                    {
                      projects.map(project => {
                        return (
                          <option value={project.uuid}>{project.name}</option>
                        )
                      })
                    }
                  </Form.Select>
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
          <h2 className="my-4">Revoke Refresh Token</h2>
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
          <h2 className="my-4">Validate Identity Token</h2>
          <Card>
            <Card.Header className="d-flex bg-light">
            Paste the token to validate:
            </Card.Header>
            <Card.Body>
            <Form.Group>
                  <Form.Label>Paste the token to validate:</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    id="validateTokenTextArea"
                    value={validateTokenValue}
                    onChange={(e) => this.setState({ validateTokenValue: e.target.value, isTokenValid: false })}
                  />
              </Form.Group>
            </Card.Body>
          </Card>
          {validateSuccess && isTokenValid && (
              <>
                <Alert variant="success">
                  {tokenMsg}
                </Alert>
                <Form.Group>
                  <Form.Label>Decoded Token:</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={6}
                    value={JSON.stringify(decodedToken, undefined, 4) }
                    readOnly
                  />
                </Form.Group>
              </>
          )}
          {validateSuccess && !isTokenValid && validateTokenValue !== '' && (
            <Alert variant="danger">
              Token is invalid!
            </Alert>
          )}
          <button
            className="btn btn-outline-primary mt-3"
            onClick={e => this.validateToken(e)}
          >
            Validate Token
          </button>
        </div>
        }
      </div>
    )
  }
}

export default CredentialManagerPage;