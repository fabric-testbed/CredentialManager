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
"""
Module for handling /tokens APIs
"""
from http.client import INTERNAL_SERVER_ERROR

import connexion
from fss_utils.http_errors import cors_response
from fss_utils.jwt_manager import JWTManager, ValidateCode

from fabric_cm.credmgr.credential_managers.oauth_credmgr import OAuthCredmgr
from fabric_cm.credmgr.swagger_server.models.request import Request  # noqa: E501
from fabric_cm.credmgr.swagger_server.models.success import Success  # noqa: E501
from fabric_cm.credmgr.swagger_server import received_counter, success_counter, failure_counter
from fabric_cm.credmgr.swagger_server.response.constants import HTTP_METHOD_POST, \
    TOKENS_REVOKE_URL, TOKENS_REFRESH_URL, \
    TOKENS_CREATE_URL, VOUCH_ID_TOKEN, VOUCH_REFRESH_TOKEN, AUTHORIZATION_ERR
from fabric_cm.credmgr.config import CONFIG_OBJ
from fabric_cm.credmgr.logging import LOG


def authorize(request):
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
            ci_logon_id_token = decoded_cookie.get('PIdToken', None)
            refresh_token = decoded_cookie.get('PRefreshToken', None)

    return ci_logon_id_token, refresh_token, cookie


def tokens_create_post(project_id, scope=None):  # noqa: E501
    """Generate Fabric OAuth tokens for an user

    Request to generate Fabric OAuth tokens for an user  # noqa: E501

    :param project_id: Project Id
    :type project_id: str
    :param scope: Scope for which token is requested
    :type scope: str

    :rtype: Success
    """
    received_counter.labels(HTTP_METHOD_POST, TOKENS_CREATE_URL).inc()
    try:
        ci_logon_id_token, refresh_token, cookie = authorize(connexion.request)
        if ci_logon_id_token is None:
            raise Exception(AUTHORIZATION_ERR)

        credmgr = OAuthCredmgr()
        result = credmgr.create_token(ci_logon_id_token=ci_logon_id_token,
                                      refresh_token=refresh_token,
                                      project=project_id,
                                      scope=scope,
                                      cookie=cookie)
        response = Success.from_dict(result)
        LOG.debug(result)
        success_counter.labels(HTTP_METHOD_POST, TOKENS_CREATE_URL).inc()
        return response
    except Exception as ex:
        LOG.exception(ex)
        failure_counter.labels(HTTP_METHOD_POST, TOKENS_CREATE_URL).inc()
        return cors_response(status=INTERNAL_SERVER_ERROR, xerror=str(ex), body=str(ex))


def tokens_refresh_post(body, project_id=None, scope=None):  # noqa: E501
    """Refresh FABRIC OAuth tokens for an user

    Request to refresh OAuth tokens for an user  # noqa: E501

    :param body:
    :type body: dict | bytes
    :param project_id: Project Id
    :type project_id: str
    :param scope: Scope for which token is requested
    :type scope: str

    :rtype: Success
    """
    received_counter.labels(HTTP_METHOD_POST, TOKENS_REFRESH_URL).inc()
    if connexion.request.is_json:
        body = Request.from_dict(connexion.request.get_json())  # noqa: E501
    try:
        ci_logon_id_token, refresh_token, cookie = authorize(connexion.request)
        credmgr = OAuthCredmgr()
        response = Success.from_dict(credmgr.refresh_token(refresh_token=body.refresh_token,
                                                           project=project_id, scope=scope,
                                                           cookie=cookie))
        success_counter.labels(HTTP_METHOD_POST, TOKENS_REFRESH_URL).inc()
        return response
    except Exception as ex:
        LOG.exception(ex)
        failure_counter.labels(HTTP_METHOD_POST, TOKENS_REFRESH_URL).inc()
        msg = str(ex).replace("\n", "")
        return cors_response(status=INTERNAL_SERVER_ERROR, xerror=msg, body=msg)


def tokens_revoke_post(body):  # noqa: E501
    """Revoke a refresh token for an user

    Request to revoke a refresh token for an user  # noqa: E501

    :param body:
    :type body: dict | bytes

    :rtype: Success
    """
    received_counter.labels(HTTP_METHOD_POST, TOKENS_REVOKE_URL).inc()
    if connexion.request.is_json:
        body = Request.from_dict(connexion.request.get_json())  # noqa: E501
    try:
        credmgr = OAuthCredmgr()
        credmgr.revoke_token(refresh_token=body.refresh_token)
        success_counter.labels(HTTP_METHOD_POST, TOKENS_REVOKE_URL).inc()
    except Exception as ex:
        LOG.exception(ex)
        failure_counter.labels(HTTP_METHOD_POST, TOKENS_REVOKE_URL).inc()
        msg = str(ex).replace("\n", "")
        return cors_response(status=INTERNAL_SERVER_ERROR, xerror=msg, body=msg)
    return {}
