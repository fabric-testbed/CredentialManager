import React from "react";
import Spinner from 'react-bootstrap/Spinner';

const SpinnerWithText = (props) => {
  return (
    <div className="d-flex flex-row justify-content-center my-2">
      <Spinner
        as="span"
        animation="border"
        size="sm"
        role="status"
        aria-hidden="true"
        variant="primary"
        className="mt-1"
      />
      <span className="text-primary ml-2"><b>{props.text}</b></span>
    </div>
  );
};

export default SpinnerWithText;
