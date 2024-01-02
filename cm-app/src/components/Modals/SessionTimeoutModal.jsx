import React, { Component } from "react";
import Modal from 'react-bootstrap/Modal'
import Button from 'react-bootstrap/Button'
import clearLocalStorage from "../../utils/clearLocalStorage";

class SessionTimeoutModal extends Component {
  state = {
    show: true,
    minutes: 0,
    seconds: 0,
  }

  handleLogout = () => {
    this.setState({ show: false });
    clearLocalStorage();
    window.location.href = "/logout";
  }

  handleClose = () => {
    this.setState({ show: false });
  }

  componentDidMount() {
    let minutes = Math.floor(this.props.timeLeft / 60000);
    let seconds = ((this.props.timeLeft % 60000) / 1000).toFixed(0);
    this.setState({ minutes, seconds })

    let countdownTimer = setInterval(() => {
      if(seconds > 0){
        seconds--;
      } else if (minutes > 0){
        minutes--;
        seconds = 59;
      } else {
        minutes = 0;
        seconds = 0;
      }
      this.setState({ minutes, seconds })
    }, 1000);

    localStorage.setItem("countdownTimerIntervalId", countdownTimer);
  }

  parseTimeStr = (minutes, seconds) => {
    if (minutes > 0 && seconds > 0) {
      return `${minutes} minute${minutes > 1 ? "s" : ""} ${seconds} second${seconds > 1 ? "s" : ""}`;
    }

    if (minutes > 0 && seconds === 0) {
      return `${minutes} minute${minutes > 1 ? "s" : ""}`;
    }

    if (minutes === 0 && seconds > 1) {
      return `${seconds} second${seconds > 1 ? "s" : ""}`;
    }

    if (minutes === 0 && seconds === 1) {
      clearInterval(localStorage.getItem("countdownTimerIntervalId"));
      clearInterval(localStorage.getItem(`sessionTimeoutIntervalId${this.props.modalId}`));
      this.handleLogout();
    }
  }

  render() {
    let { minutes, seconds, show } = this.state;
    return (
      <div>
        {
          this.props.timeLeft > 0 && <Modal
          size="lg"
          show={show}
          onHide={this.handleClose}
          backdrop="static"
          keyboard={false}
        >
          <Modal.Header closeButton>
            <Modal.Title>Session Timeout</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p id="countdownTimerModal">
              The current session is about to expire in <span className="text-danger font-weight-bold">
              {this.parseTimeStr(minutes, seconds)}</span>.
              Please save your work to prevent loss of data.
            </p>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={this.handleClose}>Close</Button>
            <Button variant="primary" onClick={this.handleLogout}>
              Logout
            </Button>
          </Modal.Footer>
        </Modal>

        }
      </div>
    );
  }
}

export default SessionTimeoutModal;