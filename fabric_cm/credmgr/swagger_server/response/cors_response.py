import uuid
import json
import os
from typing import Union

from fastapi.responses import JSONResponse

from fabric_cm.credmgr.swagger_server.models import Tokens, Version, Status200OkNoContent, \
    Status200OkNoContentData, Status400BadRequestErrors, Status400BadRequest, Status401UnauthorizedErrors, \
    Status401Unauthorized, Status403ForbiddenErrors, Status403Forbidden, Status404NotFoundErrors, Status404NotFound, \
    Status500InternalServerErrorErrors, Status500InternalServerError, RevokeList, DecodedToken

_INDENT = int(os.getenv('OC_API_JSON_RESPONSE_INDENT', '4'))


def delete_none(_dict):
    """
    Delete None values recursively from all of the dictionaries, tuples, lists, sets
    """
    if isinstance(_dict, dict):
        for key, value in list(_dict.items()):
            if isinstance(value, (list, dict, tuple, set)):
                _dict[key] = delete_none(value)
            elif value is None or key is None:
                del _dict[key]

    elif isinstance(_dict, (list, set, tuple)):
        _dict = type(_dict)(delete_none(item) for item in _dict if item is not None)

    return _dict


def _serialize(body: object) -> dict:
    """Serialize a model object to a dict suitable for JSONResponse."""
    cleaned = delete_none(body.to_dict())
    return cleaned


def cors_response(status_code: int = 200, body: object = None, x_error: str = None) -> JSONResponse:
    """
    Return JSONResponse object. CORS headers are handled by FastAPI CORSMiddleware.
    """
    if body is not None:
        if isinstance(body, str):
            content = json.loads(body)
        elif isinstance(body, dict):
            content = body
        else:
            content = _serialize(body)
    else:
        content = None
    return JSONResponse(status_code=status_code, content=content)


def cors_200(response_body: Union[Tokens, Version, Status200OkNoContent, DecodedToken, RevokeList] = None) -> JSONResponse:
    """
    Return 200 - OK
    """
    return cors_response(status_code=200, body=response_body)


def cors_200_no_content(details: str = None) -> JSONResponse:
    """
    Return 200 - No Content
    """
    data = Status200OkNoContentData()
    data.details = details
    data_object = Status200OkNoContent([data])
    return cors_response(status_code=200, body=data_object, x_error=details)


def cors_400(details: str = None) -> JSONResponse:
    """
    Return 400 - Bad Request
    """
    errors = Status400BadRequestErrors()
    errors.details = details
    error_object = Status400BadRequest([errors])
    return cors_response(status_code=400, body=error_object, x_error=details)


def cors_401(details: str = None) -> JSONResponse:
    """
    Return 401 - Unauthorized
    """
    errors = Status401UnauthorizedErrors()
    errors.details = details
    error_object = Status401Unauthorized([errors])
    return cors_response(status_code=401, body=error_object, x_error=details)


def cors_403(details: str = None) -> JSONResponse:
    """
    Return 403 - Forbidden
    """
    errors = Status403ForbiddenErrors()
    errors.details = details
    error_object = Status403Forbidden([errors])
    return cors_response(status_code=403, body=error_object, x_error=details)


def cors_404(details: str = None) -> JSONResponse:
    """
    Return 404 - Not Found
    """
    errors = Status404NotFoundErrors()
    errors.details = details
    error_object = Status404NotFound([errors])
    return cors_response(status_code=404, body=error_object, x_error=details)


def cors_500(details: str = None) -> JSONResponse:
    """
    Return 500 - Internal Server Error
    """
    errors = Status500InternalServerErrorErrors()
    errors.details = details
    error_object = Status500InternalServerError([errors])
    return cors_response(status_code=500, body=error_object, x_error=details)


def cors_error(ex: Exception, log=None) -> JSONResponse:
    """Turn an exception into the most useful response that is still safe.

    Every handler used to answer `cors_500("An internal error occurred. Please
    try again or contact support.")` for anything that was raised. That is the
    right answer for a bug and the wrong one for everything else, and almost
    nothing reaching these handlers is a bug:

        CredMgr: Token lifetime must be between 1 and 14
        CredMgr: Missing required parameter 'scope'!
        User: x@y.edu already has 3 long-lived tokens for this project

    Those are deliberate, actionable, and were being replaced by an instruction
    to contact support - who would then find nothing wrong, because nothing was.

    Three kinds, three answers:

      OAuthCredMgrError   Raised on purpose and already carries
                          `http_error_code`, which the handlers discarded along
                          with the message. Both are honoured here.

      CoreApiError,       An upstream failed. Not the caller's fault and not an
      LiteLLMApiError     internal error either, so 502 and say which upstream -
                          "internal error" sends people to the wrong team.

      anything else       A genuine bug. Stays generic, because the message may
                          hold a connection string, a token or a stack frame -
                          but carries a reference that is also logged, so
                          "contact support" is something support can act on
                          instead of a dead end.
    """
    from fabric_cm.credmgr.common.exceptions import OAuthCredMgrError
    from fabric_cm.credmgr.external_apis.core_api import CoreApiError
    from fabric_cm.credmgr.external_apis.litellm_api import LiteLLMApiError

    if isinstance(ex, OAuthCredMgrError):
        details = str(ex)
        code = ex.get_http_error_code()
        if log:
            log.info(f"Returning {code} to caller: {details}")
        by_code = {400: cors_400, 401: cors_401, 403: cors_403, 404: cors_404}
        return by_code.get(code, cors_500)(details=details)

    if isinstance(ex, (CoreApiError, LiteLLMApiError)):
        upstream = "the FABRIC Core API" if isinstance(ex, CoreApiError) else "the LiteLLM API"
        details = f"{upstream} returned an error: {ex}"
        if log:
            log.error(f"Upstream failure: {details}")
        return cors_response(
            status_code=502,
            body=Status500InternalServerError([
                Status500InternalServerErrorErrors(message="Bad Gateway", details=details)
            ]),
            x_error=details,
        )

    ref = uuid.uuid4().hex[:8]
    if log:
        # The reference is logged with the traceback, which is the only thing
        # that makes it useful when a user quotes it back.
        log.exception(f"Unhandled error [ref {ref}]: {ex}")
    return cors_500(
        details=f"An internal error occurred. Quote reference {ref} when contacting support."
    )
