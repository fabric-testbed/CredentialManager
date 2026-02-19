#!/usr/bin/env python3
# MIT License
#
# Copyright (c) 2020 FABRIC Testbed
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.
#
# Author Komal Thareja (kthare10@renci.org)
from datetime import datetime

import connexion
from oauthlib.oauth2.rfc6749.errors import CustomOAuth2Error

from fabric_cm.credmgr.common.utils import Utils
from fabric_cm.credmgr.core.oauth_credmgr import OAuthCredMgr, TokenState
from fabric_cm.credmgr.swagger_server.models import Tokens, Token, Status200OkNoContent, Status200OkNoContentData, \
    RevokeList, DecodedToken
from fabric_cm.credmgr.swagger_server.models.request import Request  # noqa: E501
from fabric_cm.credmgr.swagger_server import received_counter, success_counter, failure_counter
from fabric_cm.credmgr.swagger_server.models.token_post import TokenPost
from fabric_cm.credmgr.swagger_server.response.constants import HTTP_METHOD_POST, TOKENS_REVOKE_URL, \
    TOKENS_REFRESH_URL, TOKENS_CREATE_URL, TOKENS_REVOKES_URL, HTTP_METHOD_GET, TOKENS_REVOKE_LIST_URL, \
    TOKENS_VALIDATE_URL, TOKENS_DELETE_URL, TOKENS_DELETE_TOKEN_HASH_URL, HTTP_METHOD_DELETE, \
    TOKENS_CREATE_CLI_URL, TOKENS_CREATE_LLM_URL, TOKENS_DELETE_LLM_URL, TOKENS_LLM_KEYS_URL, TOKENS_LLM_MODELS_URL
from fabric_cm.credmgr.logging import LOG
from fabric_cm.credmgr.swagger_server.response.cors_response import cors_200, cors_500, cors_400
from fabric_cm.credmgr.config import CONFIG_OBJ
from fabric_cm.credmgr.swagger_server.response.decorators import login_required, login_or_token_required, vouch_authorize
from urllib.parse import quote, urlparse, urlencode, urlunparse, parse_qs

from flask import request, redirect, make_response

@login_required
def tokens_create_post(project_id: str, project_name: str, scope: str = None, lifetime: int = 4, comment: str = None,
                       claims: dict = None):  # noqa: E501
    """Generate Fabric OAuth tokens for an user

    Request to generate Fabric OAuth tokens for an user  # noqa: E501

    :param project_id: Project Id
    :type project_id: str
    :param project_name: Project identified by name
    :type project_name: str
    :param scope: Scope for which token is requested
    :type scope: str
    :param lifetime: Lifetime of the token requested in hours
    :type lifetime: int
    :param comment: Comment
    :type comment: str
    :param claims: claims
    :type claims: dict

    :rtype: Success
    """
    received_counter.labels(HTTP_METHOD_POST, TOKENS_CREATE_URL).inc()
    try:
        credmgr = OAuthCredMgr()
        remote_addr = connexion.request.remote_addr
        if connexion.request.headers.get('X-Real-IP') is not None:
            remote_addr = connexion.request.headers.get('X-Real-IP')
        token_dict = credmgr.create_token(ci_logon_id_token=claims.get(OAuthCredMgr.ID_TOKEN),
                                          refresh_token=claims.get(OAuthCredMgr.REFRESH_TOKEN),
                                          cookie=claims.get(OAuthCredMgr.COOKIE),
                                          project_id=project_id, project_name=project_name,
                                          scope=scope, lifetime=lifetime,
                                          comment=comment, remote_addr=remote_addr,
                                          user_email=claims.get(OAuthCredMgr.EMAIL))
        response = Tokens()
        token = Token().from_dict(token_dict)
        response.data = [token]
        response.size = 1
        response.type = "token"
        LOG.debug(response)
        success_counter.labels(HTTP_METHOD_POST, TOKENS_CREATE_URL).inc()
        return cors_200(response_body=response)
    except Exception as ex:
        LOG.exception(ex)
        failure_counter.labels(HTTP_METHOD_POST, TOKENS_CREATE_URL).inc()
        return cors_500(details=str(ex))


@login_required
def tokens_delete_delete(claims: dict = None):  # noqa: E501
    """Delete all tokens for a user

    Request to delete all tokens for a user  # noqa: E501
    @param claims

    :rtype: Status200OkNoContent
    """
    received_counter.labels(HTTP_METHOD_DELETE, TOKENS_DELETE_URL).inc()
    try:
        credmgr = OAuthCredMgr()
        credmgr.delete_tokens(user_email=claims.get(OAuthCredMgr.EMAIL))
        response_data = Status200OkNoContentData()
        response_data.details = f"All token for user: {claims.get(OAuthCredMgr.EMAIL)} have been successfully deleted"
        response = Status200OkNoContent()
        response.data = [response_data]
        response.size = len(response.data)
        response.status = 200
        response.type = 'no_content'
        LOG.debug(response)
        success_counter.labels(HTTP_METHOD_DELETE, TOKENS_DELETE_URL).inc()
        return cors_200(response_body=response)
    except Exception as ex:
        LOG.exception(ex)
        failure_counter.labels(HTTP_METHOD_DELETE, TOKENS_DELETE_URL).inc()
        return cors_500(details=str(ex))


@login_required
def tokens_delete_token_hash_delete(token_hash: str, claims: dict = None):  # noqa: E501
    """Delete a token for an user

    Request to delete a token for an user  # noqa: E501

    :param token_hash: Token identified by SHA256 Hash
    :type token_hash: str
    :param claims:
    :type claims: dict

    :rtype: Status200OkNoContent
    """
    received_counter.labels(HTTP_METHOD_DELETE, TOKENS_DELETE_TOKEN_HASH_URL).inc()
    try:
        credmgr = OAuthCredMgr()
        credmgr.delete_tokens(token_hash=token_hash, user_email=claims.get(OAuthCredMgr.EMAIL))
        response_data = Status200OkNoContentData()
        response_data.details = f"Token {token_hash} for user: {claims.get(OAuthCredMgr.EMAIL)} " \
                                f"has been successfully deleted"
        response = Status200OkNoContent()
        response.data = [response_data]
        response.size = len(response.data)
        response.status = 200
        response.type = 'no_content'
        LOG.debug(response)
        success_counter.labels(HTTP_METHOD_DELETE, TOKENS_DELETE_TOKEN_HASH_URL).inc()
        return cors_200(response_body=response)
    except Exception as ex:
        LOG.exception(ex)
        failure_counter.labels(HTTP_METHOD_DELETE, TOKENS_DELETE_TOKEN_HASH_URL).inc()
        return cors_500(details=str(ex))


def tokens_refresh_post(body: Request, project_id=None, project_name=None, scope=None):  # noqa: E501
    """Refresh tokens for an user

    Request to refresh OAuth tokens for an user  # noqa: E501

    :param body:
    :type body: dict | bytes
    :param project_id: Project identified by universally unique identifier
    :type project_id: str
    :param project_name: Project identified by name
    :type project_name: str
    :param scope: Scope for which token is requested
    :type scope: str

    :rtype: Tokens
    """
    received_counter.labels(HTTP_METHOD_POST, TOKENS_REFRESH_URL).inc()
    try:
        credmgr = OAuthCredMgr()
        remote_addr = connexion.request.remote_addr
        if connexion.request.headers.get('X-Real-IP') is not None:
            remote_addr = connexion.request.headers.get('X-Real-IP')
        token_dict = credmgr.refresh_token(refresh_token=body.refresh_token, project_id=project_id,
                                           project_name=project_name, scope=scope,
                                           remote_addr=remote_addr)
        response = Tokens()
        token = Token().from_dict(token_dict)
        response.data = [token]
        response.size = 1
        response.type = "token"
        LOG.debug(response)
        success_counter.labels(HTTP_METHOD_POST, TOKENS_REFRESH_URL).inc()
        return cors_200(response_body=response)
    except CustomOAuth2Error as ex:
        LOG.exception(ex)
        LOG.exception(ex.error)
        LOG.exception(ex.description)
        failure_counter.labels(HTTP_METHOD_POST, TOKENS_REFRESH_URL).inc()
        return cors_500(details=str(ex.description))
    except Exception as ex:
        LOG.exception(ex)
        failure_counter.labels(HTTP_METHOD_POST, TOKENS_REFRESH_URL).inc()
        return cors_500(details=str(ex))


@login_or_token_required
def tokens_revoke_post(body: Request, claims: dict = None):  # noqa: E501
    """Revoke a refresh token for an user

    Request to revoke a refresh token for an user  # noqa: E501

    :param body:
    :type body: dict | bytes
    :param claims
    :type claims: dict

    :rtype: Success
    """
    received_counter.labels(HTTP_METHOD_POST, TOKENS_REVOKE_URL).inc()
    try:
        credmgr = OAuthCredMgr()
        credmgr.revoke_token(refresh_token=body.refresh_token)
        success_counter.labels(HTTP_METHOD_POST, TOKENS_REVOKE_URL).inc()
        response_data = Status200OkNoContentData()
        response_data.details = f"Token '{body.refresh_token}' has been successfully revoked"
        response = Status200OkNoContent()
        response.data = [response_data]
        response.size = len(response.data)
        response.status = 200
        response.type = 'no_content'
        return cors_200(response_body=response)
    except Exception as ex:
        LOG.exception(ex)
        failure_counter.labels(HTTP_METHOD_POST, TOKENS_REVOKE_URL).inc()
        return cors_500(details=str(ex))


@login_or_token_required
def tokens_revokes_post(body: TokenPost, claims: dict = None):  # noqa: E501
    """Revoke a refresh token for an user

    Request to revoke a refresh token for an user  # noqa: E501

    :param body:
    :type body: dict | bytes
    :param claims
    :type claims: dict

    :rtype: Success
    """
    received_counter.labels(HTTP_METHOD_POST, TOKENS_REVOKES_URL).inc()
    try:
        credmgr = OAuthCredMgr()
        if body.type == "identity":
            cookie = claims.get(OAuthCredMgr.COOKIE)
            id_token = request.headers.get('authorization')
            if id_token:
                id_token = id_token.replace('Bearer ', '')
            credmgr.revoke_identity_token(token_hash=body.token, user_email=claims.get(OAuthCredMgr.EMAIL),
                                          cookie=cookie, token=id_token)
        else:
            credmgr.revoke_token(refresh_token=body.token)
        success_counter.labels(HTTP_METHOD_POST, TOKENS_REVOKES_URL).inc()
        response_data = Status200OkNoContentData()
        response_data.details = f"Token of type '{body.type}' has been successfully revoked"
        response = Status200OkNoContent()
        response.data = [response_data]
        response.size = len(response.data)
        response.status = 200
        response.type = 'no_content'
        return cors_200(response_body=response)
    except Exception as ex:
        LOG.exception(ex)
        failure_counter.labels(HTTP_METHOD_POST, TOKENS_REVOKES_URL).inc()
        return cors_500(details=str(ex))


@login_or_token_required
def tokens_get(token_hash=None, project_id=None, expires=None, states=None, limit=None, offset=None,
               claims: dict = None):  # noqa: E501
    """Get tokens

    :param token_hash: Token identified by SHA256 hash
    :type token_hash: str
    :param project_id: Project identified by universally unique identifier
    :type project_id: str
    :param expires: Search for tokens with expiry time lesser than the specified expiration time
    :type expires: str
    :param states: Search for Tokens in the specified states
    :type states: List[str]
    :param limit: maximum number of results to return per page (1 or more)
    :type limit: int
    :param offset: number of items to skip before starting to collect the result set
    :type offset: int
    :param claims
    :type claims: dict

    :rtype: Tokens
    """
    received_counter.labels(HTTP_METHOD_GET, TOKENS_REVOKE_LIST_URL).inc()

    if expires is not None:
        try:
            expires = datetime.strptime(expires, OAuthCredMgr.TIME_FORMAT)
        except Exception:
            return cors_400(f"Expiry time is not in format {OAuthCredMgr.TIME_FORMAT}")

    try:
        credmgr = OAuthCredMgr()
        token_list = credmgr.get_tokens(token_hash=token_hash, project_id=project_id, user_email=claims.get(OAuthCredMgr.EMAIL),
                                        expires=expires, states=states, limit=limit, offset=offset)
        success_counter.labels(HTTP_METHOD_GET, TOKENS_REVOKE_LIST_URL).inc()
        response = Tokens()
        response.data = []
        for t in token_list:
            token = Token().from_dict(t)
            response.data.append(token)
        response.size = len(response.data)
        response.type = "token"
        LOG.debug(response)
        return cors_200(response_body=response)
    except Exception as ex:
        LOG.exception(ex)
        failure_counter.labels(HTTP_METHOD_GET, TOKENS_REVOKE_LIST_URL).inc()
        return cors_500(details=str(ex))


def tokens_revoke_list_get(project_id: str):  # noqa: E501
    """Get token revoke list i.e. list of revoked identity token hashes

    Get token revoke list i.e. list of revoked identity token hashes for a user in a project  # noqa: E501

    :param project_id: Project identified by universally unique identifier
    :type project_id: str

    :rtype: RevokeList
    """
    received_counter.labels(HTTP_METHOD_GET, TOKENS_REVOKE_LIST_URL).inc()
    try:
        credmgr = OAuthCredMgr()
        token_list = credmgr.get_token_revoke_list(project_id=project_id)
        success_counter.labels(HTTP_METHOD_GET, TOKENS_REVOKE_LIST_URL).inc()
        response = RevokeList()
        response.data = token_list
        response.size = len(response.data)
        response.type = "revoked token hashes"
        return cors_200(response_body=response)
    except Exception as ex:
        LOG.exception(ex)
        failure_counter.labels(HTTP_METHOD_GET, TOKENS_REVOKE_LIST_URL).inc()
        return cors_500(details=str(ex))


def tokens_validate_post(body: TokenPost):  # noqa: E501
    """Validate an identity token issued by Credential Manager

    Validate an identity token issued by Credential Manager  # noqa: E501

    :param body:
    :type body: dict | bytes

    :rtype: Status200OkNoContent
    """
    received_counter.labels(HTTP_METHOD_POST, TOKENS_VALIDATE_URL).inc()
    try:
        if body.type == "identity":
            credmgr = OAuthCredMgr()
            state, claims = credmgr.validate_token(token=body.token)
        else:
            raise Exception(f"Invalid token type: {body.type}")

        success_counter.labels(HTTP_METHOD_POST, TOKENS_VALIDATE_URL).inc()
        response_data = Status200OkNoContentData()
        response_data.details = f"Token is {state}!"
        response = DecodedToken()
        response.data = [response_data]
        response.size = len(response.data)
        response.status = 200
        response.type = 'no_content'
        response.token = claims
        return cors_200(response_body=response)
    except Exception as ex:
        LOG.exception(ex)
        failure_counter.labels(HTTP_METHOD_POST, TOKENS_VALIDATE_URL).inc()
        return cors_500(details=str(ex))


def _validate_localhost_redirect(redirect_uri: str):
    """Validate that redirect_uri points to localhost and return sanitized components.

    Returns a tuple (scheme, netloc, path) built from validated parts, or None if invalid.
    This reconstructs the URL from validated components to avoid passing raw user input through.
    """
    if not redirect_uri:
        return None
    parsed = urlparse(redirect_uri)
    if (parsed.scheme == "http" and
            parsed.hostname in ("localhost", "127.0.0.1") and
            parsed.port is not None):
        # Reconstruct from validated parts only — breaks taint chain for static analysis
        safe_netloc = f"{parsed.hostname}:{parsed.port}"
        safe_path = parsed.path if parsed.path else "/"
        return ("http", safe_netloc, safe_path)
    return None


def tokens_create_cli_get(project_id: str = None, project_name: str = None, scope: str = None,
                          lifetime: int = 4, comment: str = None,
                          redirect_uri: str = None):  # noqa: E501
    """Generate tokens for a CLI user and redirect with token data

    Two-phase flow:
    Phase 1 (not logged in): Store create params in a cookie, redirect to
        vouch login with a simple URL (just the endpoint path, no query
        params — avoids vouch URL validation issues).
    Phase 2 (logged in, after CILogon): Read params back from cookie,
        create the token, clear cookie, redirect to localhost callback.

    :param project_id: Project Id
    :param project_name: Project identified by name
    :param scope: Scope for which token is requested
    :param lifetime: Lifetime of the token requested in hours
    :param comment: Comment
    :param redirect_uri: Localhost URI to redirect to with token data
    :rtype: Redirect 302
    """
    import json as _json

    COOKIE_NAME = "fabric_cli_params"

    received_counter.labels(HTTP_METHOD_GET, TOKENS_CREATE_CLI_URL).inc()
    try:
        # Phase 2: if params missing from query, try to restore from cookie
        cli_cookie = request.cookies.get(COOKIE_NAME)
        if cli_cookie and not redirect_uri:
            try:
                saved = _json.loads(cli_cookie)
                redirect_uri = redirect_uri or saved.get("redirect_uri")
                project_id = project_id or saved.get("project_id")
                project_name = project_name or saved.get("project_name")
                scope = scope or saved.get("scope")
                lifetime = lifetime if lifetime != 4 else saved.get("lifetime", 4)
                comment = comment or saved.get("comment")
            except Exception:
                LOG.warning("CLI create: failed to parse cli params cookie")

        validated_redirect = _validate_localhost_redirect(redirect_uri)
        if not validated_redirect:
            failure_counter.labels(HTTP_METHOD_GET, TOKENS_CREATE_CLI_URL).inc()
            return cors_400(details="redirect_uri is required and must point to localhost "
                                    "(e.g. http://localhost:12345/callback)")
        safe_scheme, safe_netloc, safe_path = validated_redirect

        # Check authentication
        claims = vouch_authorize()
        if claims is None:
            # Phase 1: not logged in — save params in a cookie, then redirect
            # to vouch login with a simple URL (just this endpoint, no params).
            # Use trusted base URL from config to prevent open-redirect via header injection
            base_url = CONFIG_OBJ.get_base_url()
            return_url = f"{base_url}/credmgr/tokens/create_cli"
            login_url = f"{base_url}/cli-login?url={quote(return_url, safe='')}"

            # Save the original params so we can restore them after login
            cli_params = _json.dumps({
                "redirect_uri": redirect_uri,
                "project_id": project_id,
                "project_name": project_name,
                "scope": scope,
                "lifetime": lifetime,
                "comment": comment,
            })

            LOG.info("CLI create: user not logged in, saving params and redirecting to login")
            resp = redirect(login_url, code=302)
            resp.set_cookie(COOKIE_NAME, cli_params, max_age=600, httponly=True, samesite='Lax')
            return resp

        # Phase 2: logged in — create token and redirect to CLI callback
        # If no project specified, pick the user's first project
        if not project_id and not project_name:
            from fabric_cm.credmgr.external_apis.core_api import CoreApi
            core_api = CoreApi(api_server=CONFIG_OBJ.get_core_api_url(),
                               cookie=claims.get(OAuthCredMgr.COOKIE),
                               cookie_name=CONFIG_OBJ.get_vouch_cookie_name(),
                               cookie_domain=CONFIG_OBJ.get_vouch_cookie_domain_name())
            projects = core_api.get_user_projects()
            active_projects = [p for p in projects if p.get("active", False)]
            if not active_projects:
                failure_counter.labels(HTTP_METHOD_GET, TOKENS_CREATE_CLI_URL).inc()
                return cors_400(details="No active projects found for this user")
            project_id = active_projects[0].get("uuid")
            LOG.info(f"CLI create: no project specified, using first active project: {project_id}")

        credmgr = OAuthCredMgr()
        remote_addr = connexion.request.remote_addr
        if connexion.request.headers.get('X-Real-IP') is not None:
            remote_addr = connexion.request.headers.get('X-Real-IP')
        token_dict = credmgr.create_token(ci_logon_id_token=claims.get(OAuthCredMgr.ID_TOKEN),
                                          refresh_token=claims.get(OAuthCredMgr.REFRESH_TOKEN),
                                          cookie=claims.get(OAuthCredMgr.COOKIE),
                                          project_id=project_id, project_name=project_name,
                                          scope=scope, lifetime=lifetime,
                                          comment=comment, remote_addr=remote_addr,
                                          user_email=claims.get(OAuthCredMgr.EMAIL))

        # Build redirect URL with token data as query params
        # Use sanitized components (safe_scheme, safe_netloc, safe_path) instead of
        # raw redirect_uri to avoid untrusted URL redirection (CodeQL security finding)
        import base64 as _base64
        params = {
            "id_token": token_dict.get("id_token", ""),
            "refresh_token": token_dict.get("refresh_token", ""),
            "token_hash": token_dict.get("token_hash", ""),
            "created_at": token_dict.get("created_at", ""),
            "expires_at": token_dict.get("expires_at", ""),
            "state": token_dict.get("state", ""),
        }
        redirect_url = urlunparse((
            safe_scheme, safe_netloc, safe_path,
            '', urlencode(params), ''
        ))

        # Build a base64-encoded authorization code for manual paste fallback
        auth_code = _base64.urlsafe_b64encode(
            _json.dumps(params).encode()
        ).decode()

        LOG.info("CLI token created, serving delivery page")
        success_counter.labels(HTTP_METHOD_GET, TOKENS_CREATE_CLI_URL).inc()

        # Return an HTML page that tries JS fetch to localhost first,
        # falls back to showing a copyable authorization code (remote VM case)
        html = f"""<!DOCTYPE html>
<html>
<head><title>FABRIC CLI Token</title>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         max-width: 600px; margin: 60px auto; padding: 0 20px; color: #333; }}
  h2 {{ color: #2563eb; }}
  .spinner {{ display: inline-block; width: 20px; height: 20px; border: 3px solid #e5e7eb;
              border-top-color: #2563eb; border-radius: 50%;
              animation: spin 0.8s linear infinite; vertical-align: middle; margin-right: 8px; }}
  @keyframes spin {{ to {{ transform: rotate(360deg); }} }}
  #status {{ margin: 20px 0; padding: 16px; border-radius: 8px; background: #f0f9ff; }}
  #fallback {{ display: none; margin: 20px 0; }}
  .code-box {{ background: #1e293b; color: #e2e8f0; padding: 12px 16px; border-radius: 6px;
               font-family: monospace; font-size: 13px; word-break: break-all;
               max-height: 120px; overflow-y: auto; cursor: pointer; position: relative; }}
  .code-box:hover {{ background: #334155; }}
  .copy-btn {{ background: #2563eb; color: white; border: none; padding: 8px 20px;
               border-radius: 6px; cursor: pointer; font-size: 14px; margin-top: 10px; }}
  .copy-btn:hover {{ background: #1d4ed8; }}
  .success {{ color: #16a34a; font-weight: 600; }}
  .instructions {{ background: #fefce8; padding: 12px 16px; border-radius: 6px;
                   border-left: 4px solid #eab308; margin-top: 16px; }}
</style>
</head>
<body>
  <h2>FABRIC Token Created</h2>
  <div id="status"><span class="spinner"></span> Sending token to CLI...</div>
  <div id="fallback">
    <p>Could not reach the CLI automatically. This usually means you are running
       the CLI on a different machine (e.g. a remote VM).</p>
    <p><strong>Copy the code below and paste it into the CLI prompt:</strong></p>
    <div class="code-box" id="code" onclick="copyCode()" title="Click to copy">{auth_code}</div>
    <button class="copy-btn" onclick="copyCode()">Copy Authorization Code</button>
    <span id="copied" style="display:none; margin-left:10px;" class="success">Copied!</span>
    <div class="instructions">
      <strong>In your terminal, paste this code when prompted and press Enter.</strong>
    </div>
  </div>
  <div id="done" style="display:none;">
    <p class="success">Token sent to CLI successfully! You can close this window.</p>
  </div>
<script>
const CALLBACK_URL = {_json.dumps(redirect_url)};
function copyCode() {{
  var code = document.getElementById('code').textContent;
  navigator.clipboard.writeText(code).then(function() {{
    document.getElementById('copied').style.display = 'inline';
    setTimeout(function() {{ document.getElementById('copied').style.display = 'none'; }}, 2000);
  }});
}}
// Try to send token to the local CLI callback server
fetch(CALLBACK_URL, {{ mode: 'no-cors' }})
  .then(function() {{
    // no-cors means we can't read the response, but if it didn't throw,
    // the request likely reached the server
    document.getElementById('status').style.display = 'none';
    document.getElementById('done').style.display = 'block';
  }})
  .catch(function() {{
    // Fetch failed — localhost unreachable (remote VM scenario)
    document.getElementById('status').style.display = 'none';
    document.getElementById('fallback').style.display = 'block';
  }});
</script>
</body>
</html>"""

        resp = make_response(html, 200)
        resp.headers['Content-Type'] = 'text/html'
        # Clear the params cookie
        resp.set_cookie(COOKIE_NAME, '', max_age=0, httponly=True, samesite='Lax')
        return resp
    except Exception as ex:
        LOG.exception(ex)
        failure_counter.labels(HTTP_METHOD_GET, TOKENS_CREATE_CLI_URL).inc()
        return cors_500(details=str(ex))


@login_required
def tokens_create_llm_post(key_name: str = None, comment: str = None,
                            duration: int = 30, models: str = None,
                            claims: dict = None):  # noqa: E501
    """Create an LLM token

    Request to create an LLM token for an user  # noqa: E501

    :param key_name: Human-readable name for the key
    :type key_name: str
    :param comment: Comment
    :type comment: str
    :param duration: Token duration in days (1-30, default 30)
    :type duration: int
    :param models: Comma-separated list of model IDs to restrict the key to
    :type models: str
    :param claims: claims
    :type claims: dict

    :rtype: Status200OkNoContent
    """
    received_counter.labels(HTTP_METHOD_POST, TOKENS_CREATE_LLM_URL).inc()
    try:
        models_list = None
        if models:
            models_list = [m.strip() for m in models.split(',') if m.strip()]
        credmgr = OAuthCredMgr()
        result = credmgr.create_llm_key(cookie=claims.get(OAuthCredMgr.COOKIE),
                                         key_name=key_name, comment=comment,
                                         duration_days=duration, models=models_list)
        response_data = Status200OkNoContentData()
        response_data.details = result
        response = Status200OkNoContent()
        response.data = [response_data]
        response.size = len(response.data)
        response.status = 200
        response.type = 'no_content'
        LOG.debug(response)
        success_counter.labels(HTTP_METHOD_POST, TOKENS_CREATE_LLM_URL).inc()
        return cors_200(response_body=response)
    except Exception as ex:
        LOG.exception(ex)
        failure_counter.labels(HTTP_METHOD_POST, TOKENS_CREATE_LLM_URL).inc()
        return cors_500(details=str(ex))


@login_required
def tokens_delete_llm_delete(llm_key_id: str, claims: dict = None):  # noqa: E501
    """Delete an LLM token

    Request to delete an LLM token  # noqa: E501

    :param llm_key_id: LLM key identifier
    :type llm_key_id: str
    :param claims:
    :type claims: dict

    :rtype: Status200OkNoContent
    """
    received_counter.labels(HTTP_METHOD_DELETE, TOKENS_DELETE_LLM_URL).inc()
    try:
        credmgr = OAuthCredMgr()
        credmgr.delete_llm_key(llm_key_id=llm_key_id,
                                    user_email=claims.get(OAuthCredMgr.EMAIL),
                                    cookie=claims.get(OAuthCredMgr.COOKIE))
        response_data = Status200OkNoContentData()
        response_data.details = f"LLM token {llm_key_id} has been successfully deleted"
        response = Status200OkNoContent()
        response.data = [response_data]
        response.size = len(response.data)
        response.status = 200
        response.type = 'no_content'
        LOG.debug(response)
        success_counter.labels(HTTP_METHOD_DELETE, TOKENS_DELETE_LLM_URL).inc()
        return cors_200(response_body=response)
    except Exception as ex:
        LOG.exception(ex)
        failure_counter.labels(HTTP_METHOD_DELETE, TOKENS_DELETE_LLM_URL).inc()
        return cors_500(details=str(ex))


@login_required
def tokens_llm_keys_get(limit: int = 200, offset: int = 0,
                         claims: dict = None):  # noqa: E501
    """Get LLM tokens for a user

    Get LLM tokens for a user  # noqa: E501

    :param limit: maximum number of results to return per page (1 or more)
    :type limit: int
    :param offset: number of items to skip before starting to collect the result set
    :type offset: int
    :param claims: claims
    :type claims: dict

    :rtype: Status200OkNoContent
    """
    received_counter.labels(HTTP_METHOD_GET, TOKENS_LLM_KEYS_URL).inc()
    try:
        credmgr = OAuthCredMgr()
        keys = credmgr.get_llm_keys(cookie=claims.get(OAuthCredMgr.COOKIE),
                                         offset=offset, limit=limit)
        response_data = Status200OkNoContentData()
        response_data.details = keys
        response = Status200OkNoContent()
        response.data = [response_data]
        response.size = len(response.data)
        response.status = 200
        response.type = 'no_content'
        LOG.debug(response)
        success_counter.labels(HTTP_METHOD_GET, TOKENS_LLM_KEYS_URL).inc()
        return cors_200(response_body=response)
    except Exception as ex:
        LOG.exception(ex)
        failure_counter.labels(HTTP_METHOD_GET, TOKENS_LLM_KEYS_URL).inc()
        return cors_500(details=str(ex))


@login_required
def tokens_llm_models_get(claims: dict = None):  # noqa: E501
    """Get available LLM models

    Get available LLM models and API host information  # noqa: E501

    :param claims: claims
    :type claims: dict

    :rtype: Status200OkNoContent
    """
    received_counter.labels(HTTP_METHOD_GET, TOKENS_LLM_MODELS_URL).inc()
    try:
        credmgr = OAuthCredMgr()
        result = credmgr.get_llm_models()
        response_data = Status200OkNoContentData()
        response_data.details = result
        response = Status200OkNoContent()
        response.data = [response_data]
        response.size = len(response.data)
        response.status = 200
        response.type = 'no_content'
        LOG.debug(response)
        success_counter.labels(HTTP_METHOD_GET, TOKENS_LLM_MODELS_URL).inc()
        return cors_200(response_body=response)
    except Exception as ex:
        LOG.exception(ex)
        failure_counter.labels(HTTP_METHOD_GET, TOKENS_LLM_MODELS_URL).inc()
        return cors_500(details=str(ex))
