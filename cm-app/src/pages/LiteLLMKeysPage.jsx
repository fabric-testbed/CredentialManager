import React from "react";
import Form from 'react-bootstrap/Form';
import Card from 'react-bootstrap/Card';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Alert from 'react-bootstrap/Alert';
import Badge from 'react-bootstrap/Badge';
import SpinnerFullPage from "../components/SpinnerFullPage.jsx";
import toLocaleTime from "../utils/toLocaleTime";
import { createLiteLLMKey, getLiteLLMKeys, deleteLiteLLMKey } from "../services/credentialManagerService.js";
import { toast } from "react-toastify";

class LiteLLMKeysPage extends React.Component {
  state = {
    keys: [],
    createdKey: null,
    createSuccess: false,
    createCopySuccess: false,
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
      const errorMessage = this.getErrorMessage(ex, "Failed to load LiteLLM keys.");
      toast.error(errorMessage);
    }
  }

  createKey = async (e) => {
    e.preventDefault();
    this.setState({ showFullPageSpinner: true, spinnerMessage: "Creating LiteLLM API Key..." });
    try {
      const { keyName, keyComment } = this.state;
      const { data: res } = await createLiteLLMKey(keyName || null, keyComment || null);
      const keyData = res.data && res.data[0] && res.data[0].details;
      this.setState({
        createSuccess: true,
        createCopySuccess: false,
        createdKey: keyData,
        showFullPageSpinner: false,
        spinnerMessage: ""
      }, () => {
        this.listKeys();
      });
      toast.success("LiteLLM API key created successfully.");
    } catch (ex) {
      this.setState({ showFullPageSpinner: false, spinnerMessage: "" });
      const errorMessage = this.getErrorMessage(ex, "Failed to create LiteLLM API key.");
      toast.error(errorMessage);
    }
  }

  deleteKey = async (e, keyId) => {
    e.preventDefault();
    try {
      await deleteLiteLLMKey(keyId);
      toast.success("LiteLLM API key deleted successfully.");
      this.listKeys();
    } catch (ex) {
      const errorMessage = this.getErrorMessage(ex, "Failed to delete LiteLLM API key.");
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

  render() {
    const { keys, createdKey, createSuccess, createCopySuccess, listSuccess,
      keyName, keyComment, showFullPageSpinner, spinnerMessage } = this.state;

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
          Manage your LiteLLM API keys for accessing FABRIC AI services.
          You must be a member of the FABRIC-LLM project to create keys.
        </div>
        <h3 className="my-3">Create LiteLLM API Key</h3>
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
                className="btn btn-outline-success mt-4"
                disabled={createSuccess}
                onClick={e => this.createKey(e)}
              >
                Create Key
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
              <div className="alert alert-warning mb-2" role="alert">
                Save this API key now. It will not be shown again.
              </div>
            </div>
          )}
          {createCopySuccess && (
            <Alert variant="success">
              API key copied to clipboard!
            </Alert>
          )}
        </Form>

        <h3 className="my-3">Your LiteLLM API Keys</h3>
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
              No LiteLLM API keys found.
            </div>
          }
        </div>
      </div>
    )
  }
}

export default LiteLLMKeysPage;
