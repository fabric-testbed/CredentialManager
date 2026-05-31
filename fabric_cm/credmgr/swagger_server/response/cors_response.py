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
