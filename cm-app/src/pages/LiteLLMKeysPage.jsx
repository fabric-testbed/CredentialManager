import React from "react";
import Form from 'react-bootstrap/Form';
import Card from 'react-bootstrap/Card';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Alert from 'react-bootstrap/Alert';
import SpinnerFullPage from "../components/SpinnerFullPage.jsx";
import toLocaleTime from "../utils/toLocaleTime";
import { createLiteLLMKey, getLiteLLMKeys, deleteLiteLLMKey, getLiteLLMModels } from "../services/credentialManagerService.js";
import { toast } from "react-toastify";

class LiteLLMKeysPage extends React.Component {
  state = {
    keys: [],
    createdKey: null,
    createSuccess: false,
    createCopySuccess: false,
    chatboxConfig: null,
    chatboxCopySuccess: false,
    listSuccess: false,
    keyName: "",
    keyComment: "",
    showFullPageSpinner: false,
    spinnerMessage: ""
  }

  getErrorMessage = (error, fallbackMessage) => {
    try {
      if (error?.response?.data?.errors && Array.isArray(error.response.data.errors) && error.response.data.errors.length > 0) {
        const firstError = error.response.data.errors[0];
        return firstError.details || firstError.message || fallbackMessage;
      }
    } catch (e) {
      // If parsing fails, return fallback message
    }
    return fallbackMessage;
  }

  async componentDidMount() {
    await this.listKeys();
  }

  listKeys = async () => {
    try {
      const { data: res } = await getLiteLLMKeys();
      const keysData = res.data && res.data[0] && res.data[0].details;
      this.setState({ listSuccess: true, keys: Array.isArray(keysData) ? keysData : [] });
    } catch (ex) {
      const errorMessage = this.getErrorMessage(ex, "Failed to load LLM tokens.");
      toast.error(errorMessage);
    }
  }

  generateChatboxConfig = async (apiKey) => {
    try {
      const { data: res } = await getLiteLLMModels();
      const modelData = res.data && res.data[0] && res.data[0].details;
      const apiHost = modelData?.api_host || "";
      const models = (modelData?.models || []).map(m => ({
        modelId: m.modelId,
        capabilities: ["reasoning", "tool_use"],
        contextWindow: 131072
      }));

      const config = {
        id: `fabric-llm-${crypto.randomUUID()}`,
        name: "FABRIC AI",
        type: "openai",
        settings: {
          apiHost: apiHost,
          apiKey: apiKey,
          models: models
        }
      };
      return config;
    } catch (ex) {
      toast.warning("Could not fetch model list for Chatbox config.");
      return null;
    }
  }

  createKey = async (e, withChatboxConfig = false) => {
    e.preventDefault();
    this.setState({ showFullPageSpinner: true, spinnerMessage: "Creating LLM Token..." });
    try {
      const { keyName, keyComment } = this.state;
      const { data: res } = await createLiteLLMKey(keyName || null, keyComment || null);
      const keyData = res.data && res.data[0] && res.data[0].details;

      let chatboxConfig = null;
      if (withChatboxConfig && keyData?.api_key) {
        chatboxConfig = await this.generateChatboxConfig(keyData.api_key);
      }

      this.setState({
        createSuccess: true,
        createCopySuccess: false,
        createdKey: keyData,
        chatboxConfig: chatboxConfig,
        chatboxCopySuccess: false,
        showFullPageSpinner: false,
        spinnerMessage: ""
      }, () => {
        this.listKeys();
      });
      toast.success("LLM token created successfully.");
    } catch (ex) {
      this.setState({ showFullPageSpinner: false, spinnerMessage: "" });
      const errorMessage = this.getErrorMessage(ex, "Failed to create LLM token.");
      toast.error(errorMessage);
    }
  }

  deleteKey = async (e, keyId) => {
    e.preventDefault();
    try {
      await deleteLiteLLMKey(keyId);
      toast.success("LLM token deleted successfully.");
      this.listKeys();
    } catch (ex) {
      const errorMessage = this.getErrorMessage(ex, "Failed to delete LLM token.");
      toast.error(errorMessage);
    }
  }

  copyApiKey = (e) => {
    e.preventDefault();
    const textarea = document.getElementById("litellmApiKeyTextArea");
    if (textarea) {
      textarea.select();
      document.execCommand('copy');
      e.target.focus();
      this.setState({ createCopySuccess: true });
    }
  }

  copyChatboxConfig = (e) => {
    e.preventDefault();
    const textarea = document.getElementById("chatboxConfigTextArea");
    if (textarea) {
      textarea.select();
      document.execCommand('copy');
      e.target.focus();
      this.setState({ chatboxCopySuccess: true });
    }
  }

  downloadChatboxConfig = (e) => {
    e.preventDefault();
    const { chatboxConfig } = this.state;
    if (!chatboxConfig) return;
    const blob = new Blob([JSON.stringify(chatboxConfig, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chatbox-fabric-ai.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  render() {
    const { keys, createdKey, createSuccess, createCopySuccess, chatboxConfig,
      chatboxCopySuccess, listSuccess, keyName, keyComment,
      showFullPageSpinner, spinnerMessage } = this.state;

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
        <div className="alert alert-primary mb-2 mt-4" role="alert">
          Manage your LLM tokens for accessing FABRIC AI services.
          You must be a member of the FABRIC-LLM project to create tokens.
        </div>
        <h3 className="my-3">Create LLM Token</h3>
        <Form>
          <Row>
            <Col xs={4}>
              <Form.Group>
                <Form.Label>Key Name (optional)</Form.Label>
                <Form.Control
                  as="input"
                  type="text"
                  placeholder="e.g., my-notebook-key"
                  value={keyName}
                  onChange={(e) => this.setState({ keyName: e.target.value })}
                />
              </Form.Group>
            </Col>
            <Col xs={4}>
              <Form.Group>
                <Form.Label>Comment (optional)</Form.Label>
                <Form.Control
                  as="input"
                  type="text"
                  placeholder="e.g., Key for Jupyter notebook"
                  value={keyComment}
                  onChange={(e) => this.setState({ keyComment: e.target.value })}
                />
              </Form.Group>
            </Col>
            <Col xs={4} className="d-flex flex-row align-items-center justify-content-end">
              <button
                className="btn btn-outline-success mt-4 mr-2"
                disabled={createSuccess}
                onClick={e => this.createKey(e, false)}
              >
                Create Token
              </button>
              <button
                className="btn btn-outline-primary mt-4"
                disabled={createSuccess}
                onClick={e => this.createKey(e, true)}
              >
                Create Token &amp; Chatbox Config
              </button>
            </Col>
          </Row>
          {createSuccess && createdKey && (
            <div className="mt-2">
              <Card>
                <Card.Header className="d-flex flex-row bg-light">
                  <button
                    onClick={e => this.copyApiKey(e)}
                    className="btn btn-sm btn-outline-primary mr-2"
                  >
                    Copy API Key
                  </button>
                </Card.Header>
                <Card.Body>
                  <Form.Group>
                    <Form.Control
                      as="textarea"
                      id="litellmApiKeyTextArea"
                      defaultValue={createdKey.api_key}
                      rows={2}
                      readOnly
                    />
                  </Form.Group>
                </Card.Body>
              </Card>
              {createCopySuccess && (
                <Alert variant="success" className="mt-2">
                  API key copied to clipboard!
                </Alert>
              )}
              <div className="alert alert-warning mb-2 mt-2" role="alert">
                Save this API key now. It will not be shown again.
              </div>
            </div>
          )}
          {createSuccess && chatboxConfig && (
            <div className="mt-2">
              <Card>
                <Card.Header className="d-flex flex-row bg-light">
                  <button
                    onClick={e => this.copyChatboxConfig(e)}
                    className="btn btn-sm btn-outline-primary mr-2"
                  >
                    Copy Chatbox Config
                  </button>
                  <button
                    onClick={e => this.downloadChatboxConfig(e)}
                    className="btn btn-sm btn-outline-secondary"
                  >
                    Download JSON
                  </button>
                </Card.Header>
                <Card.Body>
                  <Form.Group>
                    <Form.Label>Chatbox Configuration</Form.Label>
                    <Form.Control
                      as="textarea"
                      id="chatboxConfigTextArea"
                      defaultValue={JSON.stringify(chatboxConfig, null, 2)}
                      rows={12}
                      readOnly
                      style={{fontFamily: "monospace", fontSize: "0.85em"}}
                    />
                  </Form.Group>
                </Card.Body>
              </Card>
              {chatboxCopySuccess && (
                <Alert variant="success" className="mt-2">
                  Chatbox config copied to clipboard!
                </Alert>
              )}
              <div className="alert alert-info mb-2 mt-2" role="alert">
                Import this configuration into Chatbox to connect to FABRIC AI services.
              </div>
            </div>
          )}
        </Form>

        <h3 className="my-3">Your LLM Tokens</h3>
        <div className="mt-3">
          {
            listSuccess && keys.length > 0 ?
            <table className="table table-striped table-bordered w-auto">
              <thead>
                <tr>
                  <th>Key Alias</th>
                  <th>Key ID</th>
                  <th>Spend</th>
                  <th>Max Budget</th>
                  <th>Created At</th>
                  <th>Expires At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {
                  keys.map((key, index) => (
                    <tr key={index}>
                      <td className="col-md-2">{key['key_alias'] || key['key_name'] || '-'}</td>
                      <td className="col-md-3">
                        <span className="text-monospace" style={{fontSize: "0.85em"}}>
                          {key['token'] || key['litellm_key_id'] || '-'}
                        </span>
                      </td>
                      <td className="col-md-1">
                        {key['spend'] !== undefined && key['spend'] !== null
                          ? `$${parseFloat(key['spend']).toFixed(4)}`
                          : '-'}
                      </td>
                      <td className="col-md-1">
                        {key['max_budget'] !== undefined && key['max_budget'] !== null
                          ? `$${parseFloat(key['max_budget']).toFixed(2)}`
                          : 'Unlimited'}
                      </td>
                      <td className="col-md-2">
                        {key['created_at'] ? toLocaleTime(key['created_at']) : '-'}
                      </td>
                      <td className="col-md-2">
                        {key['expires'] ? toLocaleTime(key['expires']) :
                         key['expires_at'] ? toLocaleTime(key['expires_at']) : 'Never'}
                      </td>
                      <td className="col-md-1">
                        <button
                          className="btn btn-sm btn-outline-danger"
                          onClick={e => this.deleteKey(e, key['token'] || key['litellm_key_id'])}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
            :
            <div className="alert alert-primary my-2">
              No LLM tokens found.
            </div>
          }
        </div>
      </div>
    )
  }
}

export default LiteLLMKeysPage;
