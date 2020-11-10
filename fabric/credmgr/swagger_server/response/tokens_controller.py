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
import connexion

from fabric.credmgr.credential_managers.oauth_credmgr import OAuthCredmgr
from fabric.credmgr.swagger_server.models.request import Request  # noqa: E501
from fabric.credmgr.swagger_server.models.success import Success  # noqa: E501
from fabric.credmgr.swagger_server import received_counter, success_counter, failure_counter
from fabric.credmgr.swagger_server.response.constants import HTTP_METHOD_POST, \
    TOKENS_REVOKE_URL, TOKENS_REFRESH_URL, \
    TOKENS_CREATE_URL, VOUCH_ID_TOKEN, VOUCH_REFRESH_TOKEN, VOUCH_COOKIE
from fabric.credmgr.utils import LOG


def tokens_create_post(project_name=None, scope=None):  # noqa: E501
    """Generate Fabric OAuth tokens for an user

    Request to generate Fabric OAuth tokens for an user  # noqa: E501

    :param project_name: Project Name
    :type project_name: str
    :param scope: Scope for which token is requested
    :type scope: str

    :rtype: Success
    """
    received_counter.labels(HTTP_METHOD_POST, TOKENS_CREATE_URL).inc()
    try:
        ci_logon_id_token = connexion.request.headers.get(VOUCH_ID_TOKEN, None)
        refresh_token = connexion.request.headers.get(VOUCH_REFRESH_TOKEN, None)
        cookie = connexion.request.headers.get(VOUCH_COOKIE, None)
        credmgr = OAuthCredmgr()
        result = credmgr.create_token(ci_logon_id_token=ci_logon_id_token,
                                      refresh_token=refresh_token,
                                      project=project_name,
                                      scope=scope,
                                      cookie=cookie)
        response = Success.from_dict(result)
        LOG.debug(result)
        success_counter.labels(HTTP_METHOD_POST, TOKENS_CREATE_URL).inc()
        return response
    except Exception as ex:
        LOG.exception(ex)
        failure_counter.labels(HTTP_METHOD_POST, TOKENS_CREATE_URL).inc()
        return str(ex), 500


def tokens_refresh_post(body, project_name=None, scope=None):  # noqa: E501
    """Refresh FABRIC OAuth tokens for an user

    Request to refresh OAuth tokens for an user  # noqa: E501

    :param body:
    :type body: dict | bytes
    :param project_name: Project Name
    :type project_name: str
    :param scope: Scope for which token is requested
    :type scope: str

    :rtype: Success
    """
    received_counter.labels(HTTP_METHOD_POST, TOKENS_REFRESH_URL).inc()
    if connexion.request.is_json:
        body = Request.from_dict(connexion.request.get_json())  # noqa: E501
    try:
        cookie = connexion.request.headers.get(VOUCH_COOKIE, None)
        credmgr = OAuthCredmgr()
        response = Success.from_dict(credmgr.refresh_token(refresh_token=body.refresh_token,
                                                           project=project_name, scope=scope,
                                                           cookie=cookie))
        success_counter.labels(HTTP_METHOD_POST, TOKENS_REFRESH_URL).inc()
        return response
    except Exception as ex:
        LOG.exception(ex)
        failure_counter.labels(HTTP_METHOD_POST, TOKENS_REFRESH_URL).inc()
        return str(ex), 500


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
        return str(ex), 500
    return {}
