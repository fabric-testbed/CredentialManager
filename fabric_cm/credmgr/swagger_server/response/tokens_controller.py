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
    TOKENS_VALIDATE_URL, TOKENS_DELETE_URL, TOKENS_DELETE_TOKEN_HASH_URL, HTTP_METHOD_DELETE
from fabric_cm.credmgr.logging import LOG
from fabric_cm.credmgr.swagger_server.response.cors_response import cors_200, cors_500, cors_400
from fabric_cm.credmgr.swagger_server.response.decorators import login_required, login_or_token_required
from flask import request

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
