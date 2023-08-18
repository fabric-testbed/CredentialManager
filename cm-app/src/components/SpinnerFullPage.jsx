import React, { useRef } from "react";
import Spinner from 'react-bootstrap/Spinner';
import Overlay from 'react-bootstrap/Overlay';
import Button from 'react-bootstrap/Button';
import { Link } from "react-router-dom";

function SpinnerFullPage(props){
  const target = useRef(null);
  const {text, showSpinner, btnText, btnPath} = props;
  
  return (
    <div>
      <Button ref={target}
       style={{
        position:"absolute",
        top: 0,
        left: 0,
        width: "0.1rem",
        height: "0.1rem",
        backgroundColor: "transparent",
        border: "none",
        overflow: "hidden",
        outline: "none"
      }}
      >
        Hidden
      </Button>
      <Overlay target={target.current} show={showSpinner} placement="auto">
        {({ placement, arrowProps, show: _show, popper, ...props }) => (
          <div
            {...props}
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              margin: "-0.4rem 0 0 0",
              width: "100%",
              height: "100vh",
              overflow: "hidden",
              color: 'white',
              fontSize: "2rem",
              ...props.style,
            }}
            className="d-flex flex-column align-items-center justify-content-center"
          >
            <div className="d-flex flex-column align-items-center justify-content-center mx-5 px-5">
              <span className="mr-2 mb-2">{text}</span>
              <Spinner animation="border" role="status" variant="white" />
            </div>
            {
              btnText && btnText !== "" &&
              <Link to={btnPath} className="btn btn-primary my-4">
                { btnText }
              </Link>
            }
          </div>
        )}
      </Overlay>
    </div>
  );
};

export default SpinnerFullPage;