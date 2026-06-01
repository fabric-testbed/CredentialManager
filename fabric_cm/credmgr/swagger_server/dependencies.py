from typing import Union
from urllib.parse import urlparse

import jwt as pyjwt

from fastapi import Request, HTTPException

from fabric_cm.credmgr.common.utils import Utils
from fabric_cm.credmgr.core.oauth_credmgr import OAuthCredMgr, TokenState
from fabric_cm.credmgr.swagger_server import jwt_validator
from fss_utils.jwt_manager import JWTManager, ValidateCode

from fabric_cm.credmgr.config import CONFIG_OBJ

from fabric_cm.credmgr.swagger_server.response.constants import VOUCH_ID_TOKEN, VOUCH_REFRESH_TOKEN

from fabric_cm.credmgr.logging import LOG

EMAIL = "email"


def _csrf_check(request: Request) -> bool:
    """
    CSRF protection for cookie-authenticated requests.
    Validates that Origin or Referer header matches the configured base URL
    or any of the CORS allowed origins.
    Requests with Bearer token auth bypass this check (no cookie = no CSRF risk).
    """
    if request.method in ('GET', 'HEAD', 'OPTIONS'):
        return True

    # If using Bearer token auth, CSRF is not a concern
    if 'authorization' in [h.casefold() for h in request.headers.keys()]:
        return True

    # Build set of allowed origin netlocs from base_url + CORS allowed origins
    allowed_netlocs = set()
    try:
        base_url = CONFIG_OBJ.get_base_url()
        allowed_netlocs.add(urlparse(base_url).netloc)
    except Exception:
        pass

    for cors_origin in CONFIG_OBJ.get_cors_allowed_origins():
        netloc = urlparse(cors_origin).netloc
        if netloc:
            allowed_netlocs.add(netloc)

    if not allowed_netlocs:
        # No origins configured — skip CSRF check
        return True

    origin = request.headers.get('Origin')
    if origin:
        return urlparse(origin).netloc in allowed_netlocs

    referer = request.headers.get('Referer')
    if referer:
        return urlparse(referer).netloc in allowed_netlocs

    # No Origin or Referer — block (same-origin requests always include one)
    return False


def vouch_authorize(request: Request) -> Union[dict, None]:
    """
    Decode vouch cookie and extract identity and refresh tokens.
    """
    ci_logon_id_token = request.headers.get(VOUCH_ID_TOKEN, None)
    refresh_token = request.headers.get(VOUCH_REFRESH_TOKEN, None)
    cookie_name = CONFIG_OBJ.get_vouch_cookie_name()
    cookie = request.cookies.get(cookie_name)
    from_cookie = False
    if ci_logon_id_token is None and refresh_token is None and cookie is not None:
        vouch_secret = CONFIG_OBJ.get_vouch_secret()
        vouch_compression = CONFIG_OBJ.is_vouch_cookie_compressed()
        status, decoded_cookie = JWTManager.decode(cookie=cookie, secret=vouch_secret,
                                                   compression=vouch_compression, verify=True)
        if status == ValidateCode.VALID:
            ci_logon_id_token = decoded_cookie.get('PIdToken')
            refresh_token = decoded_cookie.get('PRefreshToken')
            from_cookie = True

    if ci_logon_id_token is not None and refresh_token is not None and cookie is not None:
        # SECURITY NOTE: When PIdToken comes from a vouch cookie, member_of
        # was stripped to reduce cookie size, which invalidates the CILogon
        # signature. The vouch cookie's own JWT signature IS verified above
        # (verify=True), so the PIdToken integrity is transitively protected.
        # Signature verification is only skipped for the inner CILogon JWT.
        if from_cookie:
            try:
                claims_or_exception = pyjwt.decode(ci_logon_id_token, options={"verify_signature": False})
            except Exception as e:
                LOG.error(f"Unable to decode token from cookie: {e}")
                return None
        else:
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
    Validate that the API has fabric token and the token is valid.
    """
    if token is not None:
        try:
            raw_token = token.replace('Bearer ', '')
            LOG.info("Validating Fabric token")
            credmgr = OAuthCredMgr()
            state, claims = credmgr.validate_token(token=raw_token)

            if state not in [str(TokenState.Valid), str(TokenState.Refreshed)]:
                msg = f"Unable to validate provided token: {state} claims:{claims}"
                LOG.error(msg)
                return msg
            claims["id_token"] = raw_token
            return claims
        except Exception as e:
            msg = f"Unable to validate provided token e: {e}!"
            LOG.error(msg, stack_info=True)
            return msg


async def get_login_claims(request: Request) -> dict:
    """FastAPI dependency: requires vouch cookie login."""
    if not _csrf_check(request):
        LOG.warning("CSRF check failed: Origin/Referer mismatch")
        raise HTTPException(status_code=401, detail='Request origin not allowed')
    cookie_name = CONFIG_OBJ.get_vouch_cookie_name()
    if cookie_name not in request.cookies:
        details = 'Login required'
        LOG.info(f"get_login_claims(): {details}")
        raise HTTPException(status_code=401, detail=details)
    claims = vouch_authorize(request)
    if claims is None:
        details = 'Cookie signature has expired'
        LOG.info(f"get_login_claims(): {details}")
        raise HTTPException(status_code=401, detail=details)
    return claims


async def get_login_or_token_claims(request: Request) -> dict:
    """FastAPI dependency: accepts either Authorization header or vouch cookie."""
    if not _csrf_check(request):
        LOG.warning("CSRF check failed: Origin/Referer mismatch")
        raise HTTPException(status_code=401, detail='Request origin not allowed')
    if 'authorization' in [h.casefold() for h in request.headers.keys()]:
        claims = validate_authorization_token(request.headers.get('authorization'))
        if isinstance(claims, dict):
            return claims
        else:
            details = f'Login or Token required : {claims}'
            LOG.info(f"get_login_or_token_claims(): {details}")
            raise HTTPException(status_code=401, detail=details)
    cookie_name = CONFIG_OBJ.get_vouch_cookie_name()
    if cookie_name not in request.cookies:
        details = 'Login or Token required'
        LOG.info(f"get_login_or_token_claims(): {details}")
        raise HTTPException(status_code=401, detail=details)
    claims = vouch_authorize(request)
    if claims is None:
        details = 'Cookie signature has expired'
        LOG.info(f"get_login_or_token_claims(): {details}")
        raise HTTPException(status_code=401, detail=details)
    return claims
