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
# !/usr/bin/env python3
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
import logging

import connexion
import six

from credmgr import LOGGER
from credmgr.CredentialManagers.OAuthCredmgrSingleton import OAuthCredmgrSingleton
from credmgr.swagger_server.models import CredMgrResponseValue
from credmgr.swagger_server.models.create_request import CreateRequest
from credmgr.swagger_server.models.cred_mgr_response import CredMgrResponse
from credmgr.swagger_server.models.refresh_revoke_request import RefreshRevokeRequest  # noqa: E501
from credmgr.swagger_server import util


def create_post(project_name=None, scope=None):  # noqa: E501
    """Generate OAuth tokens for an user

    Request to generate OAuth tokens for an user  # noqa: E501

    :param project_name:
    :type project_name: str
    :param scope:
    :type scope: str

    :rtype: CredMgrResponse
    """
    logger = logging.getLogger(LOGGER + '.' + __file__)
    response = CredMgrResponse()
    try:
        result = OAuthCredmgrSingleton.get().create_token(project_name, scope)
        response.message = "Please visit {}! Use {} to retrieve the token after authentication".format(result["authorization_url"],
                                                                                                    result["user_id"])
        response.value = CredMgrResponseValue.from_dict(result)
        logger.debug(result)
        logger.debug(response.value)
        response.status = 200
    except Exception as e:
        response.message = str(e)
        response.status = 500
        logger.exception(e)
    return response

def create_with_id_token_post(body, project_name=None, scope=None):  # noqa: E501
    """Generate OAuth tokens for an user provided CILogon ID Token

    Request to generate OAuth tokens for an user provided CILogon ID Token  # noqa: E501

    :param body:
    :type body: dict | bytes
    :param project_name:
    :type project_name: str
    :param scope:
    :type scope: str

    :rtype: CredMgrResponse
    """
    logger = logging.getLogger(LOGGER + '.' + __file__)
    response = CredMgrResponse()

    if connexion.request.is_json:
        body = CreateRequest.from_dict(connexion.request.get_json())  # noqa: E501

    try:
        result = OAuthCredmgrSingleton.get().create_token_from_id_token(project_name, scope, body.id_token)
        response.value = CredMgrResponseValue.from_dict(result)
        logger.debug(result)
        logger.debug(response.value)
        response.status = 200
    except Exception as e:
        response.message = str(e)
        response.status = 500
        logger.exception(e)
    return response

def get_get(user_id):  # noqa: E501
    """get tokens for an user

    Request to get tokens for an user  # noqa: E501

    :param user_id:
    :type user_id: str

    :rtype: CredMgrResponse
    """
    logger = logging.getLogger(LOGGER + '.' + __file__)
    response = CredMgrResponse()
    try:
        response.value = CredMgrResponseValue.from_dict(OAuthCredmgrSingleton.get().get_token(user_id))
        response.status = 200
    except Exception as e:
        logger.exception(e)
        response.message = str(e)
        response.status = 500
    return response


def refresh_post(body, project_name=None, scope=None):  # noqa: E501
    """Refresh OAuth tokens for an user

    Request to refresh OAuth tokens for an user  # noqa: E501

    :param body: 
    :type body: dict | bytes
    :param project_name: 
    :type project_name: str
    :param scope: 
    :type scope: str

    :rtype: CredMgrResponse
    """
    if connexion.request.is_json:
        body = RefreshRevokeRequest.from_dict(connexion.request.get_json())  # noqa: E501
    logger = logging.getLogger(LOGGER + '.' + __file__)
    response = CredMgrResponse()
    try:
        response.value = CredMgrResponseValue.from_dict(OAuthCredmgrSingleton.get().refresh_token(body.refresh_token,
                                                                                                  project_name, scope))
        response.status = 200
    except Exception as e:
        response.message = str(e)
        response.status = 500
        logger.exception(e)
    return response


def revoke_post(body):  # noqa: E501
    """Revoke a refresh token for an user

    Request to revoke a refresh token for an user  # noqa: E501

    :param body:
    :type body: dict | bytes

    :rtype: CredMgrResponse
    """
    if connexion.request.is_json:
        body = RefreshRevokeRequest.from_dict(connexion.request.get_json())  # noqa: E501
    logger = logging.getLogger(LOGGER + '.' + __file__)
    response = CredMgrResponse()
    try:
        OAuthCredmgrSingleton.get().revoke_token(body.refresh_token)
        response.message = "Token revoked successfully"
        response.status = 200
    except Exception as e:
        response.message = str(e)
        response.status = 500
        logger.exception(e)
    return response
