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

from credmgr import LOGGER
from credmgr.CredentialManagers.OAuthCredmgrSingleton import OAuthCredmgrSingleton
from credmgr.swagger_server.models import CredMgrResponseValue
from credmgr.swagger_server.models.cred_mgr_response import CredMgrResponse
from credmgr.swagger_server.models.refresh_request import RefreshRequest  # noqa: E501


def create_post(user_name):  # noqa: E501
    """create tokens for an user

    Request to create tokens for an user  # noqa: E501

    :param user_name: 
    :type user_name: str

    :rtype: CredMgrResponse
    """
    logger = logging.getLogger(LOGGER)
    response = CredMgrResponse()
    try:
        response.message = OAuthCredmgrSingleton.get().create_token(user_name)
        response.status = 200
    except Exception as e:
        response.message = str(e)
        response.status = 500
        logger.exception(e)
    return response


def get_get(user_name):  # noqa: E501
    """get tokens for an user

    Request to get tokens for an user  # noqa: E501

    :param user_name: 
    :type user_name: str

    :rtype: CredMgrResponse
    """
    logger = logging.getLogger(LOGGER)
    response = CredMgrResponse()
    try:
        response.value = CredMgrResponseValue.from_dict(OAuthCredmgrSingleton.get().get_token(user_name))
        response.status = 200
    except Exception as e:
        logger.exception(e)
        response.message = str(e)
        response.status = 500
    return response


def refresh_post(body):  # noqa: E501
    """refresh tokens

    Request to get tokens for an user  # noqa: E501

    :param body: 
    :type body: dict | bytes

    :rtype: CredMgrResponse
    """
    if connexion.request.is_json:
        body = RefreshRequest.from_dict(connexion.request.get_json())  # noqa: E501
    logger = logging.getLogger(LOGGER)
    response = CredMgrResponse()
    try:
        response.value = CredMgrResponseValue.from_dict(OAuthCredmgrSingleton.get().refresh_token(body.refresh_token))
        response.status = 200
    except Exception as e:
        response.message = str(e)
        response.status = 500
        logger.exception(e)
    return response
