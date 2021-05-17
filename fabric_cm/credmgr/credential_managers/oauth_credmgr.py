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
import requests
from requests_oauthlib import OAuth2Session

from .abstract_credential_manager import AbstractCredentialManager
from fabric_cm.credmgr.config import CONFIG_OBJ
from fabric_cm.credmgr.logging import LOG
from fabric_cm.credmgr.token.fabric_token_encoder import FabricTokenEncoder
from fabric_cm.credmgr.swagger_server import jwt_validator
from fss_utils.jwt_manager import ValidateCode


class OAuthCredmgr(AbstractCredentialManager):
    """
    Credential Manager class responsible for handling various operations supported by REST APIs
    It also provides support for scanning and cleaning up of expired tokens and key files.
    """
    ID_TOKEN = "id_token"
    REFRESH_TOKEN = "refresh_token"
    ERROR = "error"
    CLIENT_ID = "client_id"
    CLIENT_SECRET = "client_secret"
    REVOKE_URI = "revoke_uri"
    TOKEN_URI = "token_uri"
    UTF_8 = "utf-8"

    def __init__(self):
        self.log = LOG

    def _generate_fabric_token(self, ci_logon_id_token: str, project: str,
                               scope: str, cookie: str = None):
        self.log.debug("CILogon Token: %s", ci_logon_id_token)
        # validate the token
        if jwt_validator is not None:
            LOG.info("Validating CI Logon token")
            code, claims_or_exception = jwt_validator.validate_jwt(token=ci_logon_id_token)
            if code is not ValidateCode.VALID:
                LOG.error(f"Unable to validate provided token: {code}/{claims_or_exception}")
                raise claims_or_exception

            fabric_token_encoder = FabricTokenEncoder(id_token=ci_logon_id_token, idp_claims=claims_or_exception,
                                                      project=project, scope=scope, cookie=cookie)

            validity = CONFIG_OBJ.get_token_life_time()
            private_key = CONFIG_OBJ.get_jwt_private_key()
            pass_phrase = CONFIG_OBJ.get_jwt_private_key_pass_phrase()
            kid = CONFIG_OBJ.get_jwt_public_key_kid()

            return fabric_token_encoder.encode(private_key=private_key, validity_in_seconds=validity, kid=kid,
                                               pass_phrase=pass_phrase)
        else:
            LOG.warning("JWT Token validator not initialized, skipping validation")

        return None

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

        self.validate_scope(scope=scope)

        if project is None or scope is None:
            raise OAuthCredMgrError("CredMgr: Cannot request to create a token, "
                                    "Missing required parameter 'project' or 'scope'!")

        id_token = self._generate_fabric_token(ci_logon_id_token=ci_logon_id_token,
                                               project=project, scope=scope,
                                               cookie=cookie)

        result = {self.ID_TOKEN: id_token, self.REFRESH_TOKEN: refresh_token}
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

        self.validate_scope(scope=scope)

        if OAuth2Session is None or refresh_token is None:
            raise ImportError("No module named OAuth2Session or refresh_token not provided")

        provider = CONFIG_OBJ.get_oauth_provider()
        providers = CONFIG_OBJ.get_providers()

        refresh_token_dict = {self.REFRESH_TOKEN: refresh_token}
        self.log.debug(f"Incoming refresh_token: {refresh_token}")

        # refresh the token (provides both new refresh and access tokens)
        oauth_client = OAuth2Session(providers[provider][self.CLIENT_ID], token=refresh_token_dict)
        new_token = oauth_client.refresh_token(providers[provider][self.TOKEN_URI],
                                               client_id=providers[provider][self.CLIENT_ID],
                                               client_secret=providers[provider][self.CLIENT_SECRET])

        new_refresh_token = None
        try:
            new_refresh_token = new_token.pop(self.REFRESH_TOKEN)
            id_token = new_token.pop(self.ID_TOKEN)
        except KeyError:
            self.log.error("No refresh or id token returned")
            raise OAuthCredMgrError("No refresh or id token returned")
        self.log.debug(f"new_refresh_token: {new_refresh_token}")

        try:
            id_token = self._generate_fabric_token(ci_logon_id_token=id_token,
                                                   project=project, scope=scope, cookie=cookie)
            result = {self.ID_TOKEN: id_token, self.REFRESH_TOKEN: new_refresh_token}

            return result
        except Exception as e:
            self.log.error(f"Exception error while generating Fabric Token: {e}")
            self.log.error(f"Failed generating the token but still returning refresh token")
            error_string = f"error: {str(e)}, {self.REFRESH_TOKEN}: {new_refresh_token}"
            raise OAuthCredMgrError(error_string)

    def revoke_token(self, refresh_token: str):
        """
        Revoke a refresh token

        @returns dictionary containing status of the operation
        @raises Exception in case of error
        """
        if OAuth2Session is None or refresh_token is None:
            raise ImportError("No module named OAuth2Session or revoke_token not provided")

        provider = CONFIG_OBJ.get_oauth_provider()
        providers = CONFIG_OBJ.get_providers()

        auth = providers[provider][self.CLIENT_ID] + ":" + providers[provider][self.CLIENT_SECRET]
        encoded_auth = base64.b64encode(bytes(auth, self.UTF_8))

        headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + str(encoded_auth, self.UTF_8)
        }

        data = f"token={refresh_token}&token_type_hint=refresh_token"

        response = requests.post(providers[provider][self.REVOKE_URI], headers=headers, data=data)
        self.log.debug("Response Status=%d", response.status_code)
        self.log.debug("Response Reason=%s", response.reason)
        self.log.debug(str(response.content, self.UTF_8))
        if response.status_code != 200:
            raise OAuthCredMgrError(str(response.content, self.UTF_8))

    @staticmethod
    def validate_scope(scope: str):
        allowed_scopes = CONFIG_OBJ.get_allowed_scopes()
        if scope not in allowed_scopes:
            raise OAuthCredMgrError(f"Scope {scope} is not allowed! Allowed scope values: {allowed_scopes}")


class OAuthCredMgrError(Exception):
    """
    Credmgr Exception
    """
