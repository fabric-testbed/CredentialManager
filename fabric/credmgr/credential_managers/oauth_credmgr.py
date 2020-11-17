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
Module responsible for handling Credmgr REST API logic
"""

import base64
from datetime import timedelta

from fabric.credmgr.credential_managers.abstract_credential_manager import AbstractCredentialManager
from fabric.credmgr.utils import LOG
from fabric.credmgr.utils.utils import get_providers
from fabric.credmgr.utils.token import FabricToken

try:
    from requests_oauthlib import OAuth2Session
except Exception:
    OAuth2Session = None

import requests
from fabric.credmgr import CONFIG, DEFAULT_TOKEN_LIFE_TIME


class OAuthCredmgr(AbstractCredentialManager):
    """
    Credential Manager class responsible for handling various operations supported by REST APIs
    It also provides support for scanning and cleaning up of expired tokens and key files.
    """

    def __init__(self):
        self.log = LOG

    def _generate_fabric_token(self, ci_logon_id_token: str, project: str,
                               scope: str, cookie: str = None):
        self.log.debug("CILogon Token: %s", ci_logon_id_token)
        fabric_token = FabricToken(ci_logon_id_token, project, scope, cookie)
        fabric_token.decode()
        fabric_token.set_claims()
        validty = CONFIG.get('runtime', 'token-lifetime')
        if validty is None:
            validty = DEFAULT_TOKEN_LIFE_TIME
        id_token = fabric_token.encode(timedelta(minutes=int(validty)))
        self.log.debug("Fabric Token: %s", id_token)

        return id_token

    def create_token(self, project: str, scope: str, ci_logon_id_token: str,
                     refresh_token: str, cookie: str = None) -> dict:
        """
        Generates key file and return authorization url for user to
        authenticate itself and also returns user id

        @param project: Project for which token is requested, by default it is set to 'all'
        @param scope: Scope of the requested token, by default it is set to 'all'
        @param ci_logon_id_token: CI logon Identity Token
        @param refresh_token: Refresh Token
        @param cookie: Vouch Proxy Cookie

        @returns dict containing id_token and refresh_token
        @raises Exception in case of error
        """

        if project is None or scope is None:
            raise OAuthCredMgrError("CredMgr: Cannot request to create a token, "
                                    "Missing required parameter 'project' or 'scope'!")

        id_token = self._generate_fabric_token(ci_logon_id_token=ci_logon_id_token,
                                               project=project, scope=scope,
                                               cookie=cookie)

        result = {"id_token": id_token, "refresh_token":refresh_token}
        return result

    def refresh_token(self, refresh_token: str, project: str, scope: str, cookie: str = None) -> dict:
        """
        Refreshes a token from CILogon and generates Fabric token using project and scope saved in Database

        @param project: Project for which token is requested, by default it is set to 'all'
        @param scope: Scope of the requested token, by default it is set to 'all'
        @param refresh_token: Refresh Token
        @param cookie: Vouch Proxy Cookie
        @returns dict containing id_token and refresh_token

        @raises Exception in case of error
        """

        if OAuth2Session is None or refresh_token is None:
            raise ImportError("No module named OAuth2Session or refresh_token not provided")

        provider = CONFIG.get('oauth', "oauth-provider")
        providers = get_providers()

        refresh_token_dict = {"refresh_token": refresh_token}

        # refresh the token (provides both new refresh and access tokens)
        oauth_client = OAuth2Session(providers[provider]['client_id'], token=refresh_token_dict)
        new_token = oauth_client.refresh_token(providers[provider]['token_uri'],
                                               client_id=providers[provider]['client_id'],
                                               client_secret=providers[provider]['client_secret'])
        try:
            refresh_token = new_token.pop('refresh_token')
            id_token = new_token.pop('id_token')
        except KeyError:
            self.log.error("No refresh or id token returned")
            return None

        id_token = self._generate_fabric_token(ci_logon_id_token=id_token,
                                               project=project, scope=scope, cookie=cookie)

        result = {"id_token": id_token, "refresh_token": refresh_token}

        return result

    def revoke_token(self, refresh_token: str):
        """
        Revoke a refresh token

        @returns dictionary containing status of the operation
        @raises Exception in case of error
        """
        if OAuth2Session is None or refresh_token is None:
            raise ImportError("No module named OAuth2Session or revoke_token not provided")

        provider = CONFIG.get('oauth', "oauth-provider")
        providers = get_providers()

        auth = providers[provider]['client_id'] + ":" + providers[provider]['client_secret']
        encoded_auth = base64.b64encode(bytes(auth, "utf-8"))

        headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + str(encoded_auth, "utf-8")
        }

        data = "token={}&token_type_hint=refresh_token".format(refresh_token)

        response = requests.post(providers[provider]['revoke_uri'], headers=headers, data=data)
        self.log.debug("Response Status=%d", response.status_code)
        self.log.debug("Response Reason=%s", response.reason)
        self.log.debug(str(response.content, "utf-8"))
        if response.status_code != 200:
            raise OAuthCredMgrError(str(response.content,  "utf-8"))


class OAuthCredMgrError(Exception):
    """
    Credmgr Exception
    """
    pass
