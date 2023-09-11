from functools import wraps
from typing import Union

from fabric_cm.credmgr.common.utils import Utils
from fabric_cm.credmgr.core.oauth_credmgr import OAuthCredMgr, TokenState
from fabric_cm.credmgr.swagger_server import jwt_validator
from fss_utils.jwt_manager import JWTManager, ValidateCode

from fabric_cm.credmgr.config import CONFIG_OBJ

from fabric_cm.credmgr.swagger_server.response.constants import VOUCH_ID_TOKEN, VOUCH_REFRESH_TOKEN

from fabric_cm.credmgr.swagger_server.response.cors_response import cors_401

from fabric_cm.credmgr.logging import LOG
from flask import request

EMAIL = "email"


def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if CONFIG_OBJ.get_vouch_cookie_name() not in request.cookies:
            details = 'Login required'
            LOG.info(f"login_required(): {details}")
            return cors_401(details=details)
        claims = vouch_authorize()
        if claims is None:
            details = 'Cookie signature has expired'
            LOG.info(f"login_required(): {details}")
            return cors_401(details=details)

        return f(*args, claims=claims, **kwargs)

    return decorated_function


def login_or_token_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'authorization' in [h.casefold() for h in request.headers.keys()]:
            claims = validate_authorization_token(request.headers.get('authorization'))
            if isinstance(claims, dict):
                return f(*args, claims=claims, **kwargs)
            else:
                details = f'Login or Token required : {claims}'
                LOG.info(f"login_or_token_required(): {details}")
                return cors_401(details=details)
        if CONFIG_OBJ.get_vouch_cookie_name() not in request.cookies:
            details = 'Login or Token required'
            LOG.info(f"login_or_token_required(): {details}")
            return cors_401(details=details)
        claims = vouch_authorize()
        if claims is None:
            details = 'Cookie signature has expired'
            LOG.info(f"login_or_token_required(): {details}")
            return cors_401(details=details)

        return f(*args, claims=claims, **kwargs)

    return decorated_function


def vouch_authorize() -> Union[dict, None]:
    """
    Decode vouch cookie and extract identity and refresh tokens
    @return tuple containing ci logon identity token, refresh token and cookie
    """
    ci_logon_id_token = request.headers.get(VOUCH_ID_TOKEN, None)
    refresh_token = request.headers.get(VOUCH_REFRESH_TOKEN, None)
    cookie_name = CONFIG_OBJ.get_vouch_cookie_name()
    cookie = request.cookies.get(cookie_name)
    if ci_logon_id_token is None and refresh_token is None and cookie is not None:
        vouch_secret = CONFIG_OBJ.get_vouch_secret()
        vouch_compression = CONFIG_OBJ.is_vouch_cookie_compressed()
        status, decoded_cookie = JWTManager.decode(cookie=cookie,secret=vouch_secret,
                                                   compression=vouch_compression, verify=False)
        if status == ValidateCode.VALID:
            ci_logon_id_token = decoded_cookie.get('PIdToken')
            refresh_token = decoded_cookie.get('PRefreshToken')

    if ci_logon_id_token is not None and refresh_token is not None and cookie is not None:
        code, claims_or_exception = jwt_validator.validate_jwt(token=ci_logon_id_token)
        if code is not ValidateCode.VALID:
            LOG.error(f"Unable to validate provided token: {code}/{claims_or_exception}")
            return None

        result = {OAuthCredMgr.REFRESH_TOKEN: refresh_token,
                  OAuthCredMgr.ID_TOKEN: ci_logon_id_token,
                  OAuthCredMgr.COOKIE: cookie}
        for key, value in claims_or_exception.items():
            result[key] = value

        if result.get(EMAIL) is None:
            result[EMAIL] = Utils.get_user_email(cookie=cookie)
        return result


def validate_authorization_token(token: str) -> Union[dict, str]:
    """
    Validate that the API has fabric token and the token is valid
    @return returns the decoded claims
    """
    if token is not None:
        try:
            token = token.replace('Bearer ', '')
            LOG.info("Validating Fabric token")
            credmgr = OAuthCredMgr()
            state, claims = credmgr.validate_token(token=token)

            if state not in [str(TokenState.Valid), str(TokenState.Refreshed)]:
                msg = f"Unable to validate provided token: {state} claims:{claims}"
                LOG.error(msg)
                return msg
            return claims
        except Exception as e:
            msg = f"Unable to validate provided token e: {e}!"
            LOG.error(msg, stack_info=True)
            return msg

