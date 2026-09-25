import re
import traceback
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


# Credentials that turn up inside exception text: a DSN from a driver, a URL a
# request client echoes back, a header repeated in an error. Logs from this
# service are shipped by filebeat, so a password reaching a log line does not
# stay on the host - it is indexed.
_SECRET_PATTERNS = (
    # Authorization: Bearer <jwt>. FIRST, deliberately: the key/value rule below
    # also matches "authorization:" and would mask the word "Bearer" while
    # leaving the token - worse than not matching at all.
    (re.compile(r"(?i)\b(bearer)\s+[A-Za-z0-9._\-]+"), r"\1 ***"),
    # scheme://user:password@host
    (re.compile(r"(?i)\b([a-z][a-z0-9+.\-]*://[^\s:/@]+:)[^\s@]+(@)"), r"\1***\2"),
    # password=..., "password": "...", token: ..., client_secret=...
    # The optional quote after the key is what makes the JSON form match; a bare
    # \s*[=:] misses {"password": "x"} entirely.
    (re.compile(
        r"(?i)\b(password|passwd|pwd|secret|client[_-]?secret|token|api[_-]?key|"
        r"authorization)\b([\"']?\s*[=:]\s*)([\"']?)[^\s,;&\"'}]+\3"
    ), r"\1\2***"),
)


def scrub_secrets(text: str) -> str:
    """Mask credential-shaped substrings.

    Deliberately narrow: it masks the value after a credential-ish key and the
    password in a URL, and leaves everything else intact, because an error
    message with the useful half redacted is no better than no message. It is
    a second line of defence, not a reason to log secrets confidently.
    """
    if not text:
        return text
    for pattern, replacement in _SECRET_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


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
        # Machine-generated, and it reaches the caller - scrub before it leaves.
        details = scrub_secrets(f"{upstream} returned an error: {ex}")
        if log:
            # The upstream's own words go to the caller, not into the log. What
            # a log is useful for here is the pattern - "the Core API is failing
            # a lot this morning" - and that needs the name and nothing else.
            # It also means no upstream-controlled text reaches a log sink.
            log.error(f"Upstream failure from {upstream}: {type(ex).__name__}")
        return cors_response(
            status_code=502,
            body=Status500InternalServerError([
                Status500InternalServerErrorErrors(message="Bad Gateway", details=details)
            ]),
            x_error=details,
        )

    ref = uuid.uuid4().hex[:8]
    if log:
        # Frames and the exception's CLASS, never its message.
        #
        # `log.exception` and `format_exception` both append the message, which
        # is the part that can hold a DSN, a token or a header. Scrubbing it is
        # only a heuristic: it catches labelled secrets and URL credentials, and
        # would miss a bare one. Logs here are shipped off the host and indexed,
        # so the message is not worth that risk.
        #
        # `format_tb` gives file, line, function and the source line - code, not
        # runtime data - which with the exception class is enough to find almost
        # any bug. Still scrubbed, because a frame can show a literal.
        # Built from each frame's own fields rather than by formatting the
        # traceback. `format_tb` returns text derived from the exception, and a
        # dataflow analysis is right not to trust that; filename, line number
        # and function name are structural facts about the code, and cannot
        # carry a caller's or an upstream's data.
        frames = " <- ".join(
            f"{f.filename.rsplit('/', 1)[-1]}:{f.lineno} in {f.name}"
            for f in traceback.extract_tb(ex.__traceback__)
        )
        log.error(f"Unhandled error [ref {ref}]: {type(ex).__name__} at {frames}")
    return cors_500(
        details=f"An internal error occurred. Quote reference {ref} when contacting support."
    )
