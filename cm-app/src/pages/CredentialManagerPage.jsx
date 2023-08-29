import React from "react";
import Form from 'react-bootstrap/Form';
import Card from 'react-bootstrap/Card';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Alert from 'react-bootstrap/Alert';
import Badge from 'react-bootstrap/Badge';
import SpinnerFullPage from "../components/SpinnerFullPage.jsx";
import toLocaleTime from "../utils/toLocaleTime";
import { createIdToken, revokeToken, getTokenByProjectId, validateToken } from "../services/credentialManagerService.js";
import { getProjects } from "../services/coreApiService.js";
import { default as externalLinks } from "../services/externalLinks.json";
import checkCmAppType from "../utils/checkCmAppType";
import { toast } from "react-toastify";

class CredentialManagerPage extends React.Component {
  state = {
    projects: [],
    createToken: "",
    tokenList: [],
    createSuccess: false,
    createCopySuccess: false,
    listSuccess: false,
    scopeOptions: [
      { id: 1, value: "all", display: "All"},
      { id: 2, value: "cf", display: "Control Framework"},
      { id: 3, value: "mf", display: "Measurement Framework"},
    ],
    selectedCreateScope: "all",
    selectedProjectId: "",
    isTokenHolder: false,
    validateTokenValue: "",
    isTokenValid: false,
    validateSuccess: false,
    revokeIdentitySuccess: false,
    decodedToken: "",
    tokenMsg: "",
    inputLifetime: 4, // Default lifetime is 4 hours
    selectLifetimeUnit: "hours",
    tokenComment: "Created via GUI", // Added comment for creating tokens,
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
          this.setState({
            selectedProjectId: projects[0].uuid,
            isTokenHolder: projects[0].memberships.is_token_holder
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
    if (unit === "hours") { return parseInt(time); }
    if (unit === "days") { return parseInt(time) * 24; }
    if (unit === "weeks") { return parseInt(time) * 24 * 7; }
  }

  createToken = async (e) => {
    e.preventDefault();
    this.setState({ showFullPageSpinner: true, spinnerMessage: "Creating Token..."});
    try {
      const projectId = this.state.selectedProjectId;
      const scope = this.state.selectedCreateScope;
      const lifetime = this.parseTokenLifetime(); // Added lifetime parameter
      const comment = this.state.tokenComment; // Added comment for the token
      const { data: res } = await createIdToken(projectId, scope, lifetime, comment);
      console.log("Response received: " + res)
      this.setState({
        createCopySuccess: false,
        createSuccess: true,
        createToken: JSON.stringify(res["data"][0], undefined, 4),
        showFullPageSpinner: false,
        spinnerMessage: "",
        selectedProjectId: projectId
      }, () => {
        this.listTokens();
      });

      toast.success("Token created successfully.");
    } catch (ex) {
      this.setState({ showFullPageSpinner: false, spinnerMessage: ""});
      toast.error("Failed to create token.");
    }
  }

  revokeIdentityToken = async (e, tokenHash) => {
    e.preventDefault();

    try {
      const { data: res } = await revokeToken("identity", tokenHash);
      this.setState({
        revokeIdentitySuccess: true,
        revokedTokenHash: tokenHash
      }, () => {
        this.listTokens();
      });

      toast.success("Token revoked successfully.");
    }
    catch (ex) {
      this.setState({ revokeIdentitySuccess: false, revokedTokenHash: "" });
      toast.error("Failed to revoke token.")
    }
  }

  listTokens = async () => {
    try {
      const projectId = this.state.selectedProjectId;
      const res = await getTokenByProjectId(projectId); // Assuming getTokenByProjectId returns an array of tokens
      this.setState({ listSuccess: true, tokenList: res.data.data });
    } catch (ex) {
      toast.error("Failed to get tokens.");
    }
  }

  validateToken = async (e) => {
    e.preventDefault();

    try {
      const { data: res } = await validateToken(this.state.validateTokenValue);
      this.setState({ validateSuccess: true, isTokenValid: true, decodedToken: res.token, tokenMsg: "Token is validated." });
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

  handleSelectProject = (e) =>{
    const project = this.state.projects.filter(p => p.uuid === e.target.value)[0];
    // change selected project, hide any created token from UI and reset options
    this.setState({
      selectedProjectId: project.uuid,
      isTokenHolder: project.memberships.is_token_holder,
      createSuccess: false,
      createCopySuccess: false,
      inputLifetime: 4,
      selectLifetimeUnit: "hours", 
      selectedCreateScope: "all",
      tokenComment: "Created via GUI"
    }, () => {
      this.listTokens();
    });
  }

  handleSelectCreateScope = (e) =>{
    this.setState({ selectedCreateScope: e.target.value });
  }

  handleLifetimeChange = (e) => {
    this.setState({ inputLifetime: parseInt(e.target.value) });
  };

  handleLifetimeUnitChange = (e) => {
    this.setState({ selectLifetimeUnit: e.target.value });
  }

  handleCommentChange = (e) => {
    this.setState({ tokenComment: e.target.value });
  };

  getTokenStateClasses = (state) => {
    if (state === "Revoked" || state === "Expired") {
      return "danger";
    } else if (state === "Valid" || state === "Refreshed") {
      return "success";
    } else {
      return "primary";
    }
  }

  render() {
    const { projects, scopeOptions, createSuccess, createToken, createCopySuccess, inputLifetime, selectedProjectId,
      selectLifetimeUnit, selectedCreateScope, listSuccess, tokenList, decodedToken, tokenMsg, validateTokenValue, 
      isTokenValid, validateSuccess, tokenComment, showFullPageSpinner, spinnerMessage, 
      isTokenHolder } = this.state;

    const portalLink = this.portalLinkMap[checkCmAppType()];

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
          <h3 className="my-3">Create and List Tokens</h3>
          <Form>
          <Row>
            <Col xs={12}>
              <Form.Group>
                <Form.Label>Select Project</Form.Label>
                <Form.Select
                  value={selectedProjectId}
                  onChange={this.handleSelectProject}
                >
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
          <div className="alert alert-success my-2" role="alert">
            {
              !isTokenHolder ?
              <span>
                The default token lifetime is 4 hours. To obtain <a
                  href={externalLinks.learnArticleLonglivedTokens}
                  target="_blank"
                  rel="noreferrer"
                >
                  <b>long-lived tokens</b>
                </a> for the selected project, please request access from <a href={portalLink} target="_blank" rel="noreferrer">FABRIC Portal</a>.
              </span> :
              <span>
                You have access to <a
                  href={externalLinks.learnArticleLonglivedTokens}
                  target="_blank"
                  rel="noreferrer"
                >
                <b>long-lived tokens</b></a> for this project. The lifetime limit is 9 weeks.
              </span>
            }
          </div>
          <Form>
            <Row>
              <Col xs={2}>
                <Form.Group>
                  <Form.Label>
                    Lifetime
                  </Form.Label>
                  <Form.Control
                    disabled={!isTokenHolder}
                    as="input"
                    type="number"
                    value={inputLifetime}
                    onChange={this.handleLifetimeChange}
                  />
                </Form.Group>
              </Col>
              <Col xs={2}>
                <Form.Group>
                  <Form.Label>Unit</Form.Label>
                  <Form.Select
                    value={selectLifetimeUnit}
                    onChange={this.handleLifetimeUnitChange}
                    disabled={!isTokenHolder}
                  >
                    <option value={"hours"}>Hours</option>
                    <option value={"days"}>Days</option>
                    <option value={"weeks"}>Weeks</option>
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col xs={3}>
                <Form.Group>
                <Form.Label>Comment (10 - 100 characters)</Form.Label>
                <Form.Control as="input" type="text" value={tokenComment} onChange={this.handleCommentChange} />
              </Form.Group>
              </Col>
              <Col xs={3}>
                <Form.Group>
                  <Form.Label>Select Scope</Form.Label>
                  <Form.Select
                    value={selectedCreateScope}
                    onChange={this.handleSelectCreateScope}
                  >
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
                  className="btn btn-outline-success mt-4"
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
          <div className="mt-3">
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
                        <td className="col-md-1">
                          <Badge bg={this.getTokenStateClasses(token['state'])}>
                            {token['state']}
                          </Badge>
                        </td>
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
          <h3 className="my-3">Validate Identity Token</h3>
          <Card>
            <Card.Header className="d-flex bg-light">
            Paste the token to validate:
            </Card.Header>
            <Card.Body>
              <Form.Group>
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