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
import enum
import hashlib
from datetime import datetime, timezone, timedelta
from enum import Enum
from typing import List, Dict, Any, Tuple

import requests
from requests_oauthlib import OAuth2Session

from . import DB_OBJ
from .abstract_cred_mgr import AbcCredMgr
from fabric_cm.credmgr.config import CONFIG_OBJ
from fabric_cm.credmgr.logging import LOG
from fabric_cm.credmgr.token.token_encoder import TokenEncoder
from fabric_cm.credmgr.swagger_server import jwt_validator
from fss_utils.jwt_manager import ValidateCode


class OAuthCredMgrError(Exception):
    """
    CredMgr Exception
    """


class TokenState(Enum):
    Nascent = enum.auto()
    Active = enum.auto()
    Refreshed = enum.auto()
    Revoked = enum.auto()
    Expired = enum.auto()

    def __str__(self):
        return self.name

    @classmethod
    def list_values(cls) -> List[int]:
        return list(map(lambda c: c.value, cls))

    @classmethod
    def list_names(cls) -> List[str]:
        return list(map(lambda c: c.name, cls))

    @staticmethod
    def translate_list(states: List[str]) -> List[int] or None:
        if states is None or len(states) == 0:
            return states

        incoming_states = list(map(lambda x: x.lower(), states))

        result = TokenState.list_values()

        for s in TokenState:
            if s.name.lower() not in incoming_states:
                result.remove(s.value)

        return result


class OAuthCredMgr(AbcCredMgr):
    """
    Credential Manager class responsible for handling various operations supported by REST APIs
    It also provides support for scanning and cleaning up of expired tokens and key files.
    """
    ID_TOKEN = "id_token"
    REFRESH_TOKEN = "refresh_token"
    CREATED_AT = "created_at"
    EXPIRES_AT = "expires_at"
    TOKEN_HASH = "token_hash"
    STATE = "state"
    CREATED_FROM = "created_from"
    ERROR = "error"
    CLIENT_ID = "client_id"
    CLIENT_SECRET = "client_secret"
    REVOKE_URI = "revoke_uri"
    TOKEN_URI = "token_uri"
    UTF_8 = "utf-8"
    TIME_FORMAT = "%Y-%m-%d %H:%M:%S %z"
    COOKIE = "cookie"

    def __init__(self):
        self.log = LOG

    @staticmethod
    def __generate_sha256(*, token: str):
        """
        Generate SHA 256 for a token
        @param token token string
        """
        # Create a new SHA256 hash object
        sha256_hash = hashlib.sha256()

        # Convert the string to bytes and update the hash object
        sha256_hash.update(token.encode('utf-8'))

        # Get the hexadecimal representation of the hash
        sha256_hex = sha256_hash.hexdigest()

        return sha256_hex

    def __generate_token_and_save_info(self, ci_logon_id_token: str, project: str, scope: str, cookie: str = None,
                                       lifetime: int = 1, refresh: bool = False) -> Dict[str, str]:
        """
        Generate Fabric Token and save the corresponding meta information in the database
        @param ci_logon_id_token    CI logon Identity Token
        @param project              Project Id
        @param scope                Token scope; allowed values (cf, mf, all)
        @param cookie               Vouch Cookie
        @param lifetime             Token lifetime in hours; default 1 hour; max is 9 weeks i.e. 1512 hours
        @param refresh              Flag indicating if token was refreshed (True) or created new (False)
        """
        self.log.debug("CILogon Token: %s", ci_logon_id_token)

        # validate the token
        if jwt_validator is not None:
            LOG.info("Validating CI Logon token")
            code, claims_or_exception = jwt_validator.validate_jwt(token=ci_logon_id_token, verify_exp=True)
            if code is not ValidateCode.VALID:
                LOG.error(f"Unable to validate provided token: {code}/{claims_or_exception}")
                raise claims_or_exception

            # Create an encoder
            token_encoder = TokenEncoder(id_token=ci_logon_id_token, idp_claims=claims_or_exception, project=project,
                                         scope=scope, cookie=cookie)

            # convert lifetime to seconds
            validity = lifetime * 3600
            private_key = CONFIG_OBJ.get_jwt_private_key()
            pass_phrase = CONFIG_OBJ.get_jwt_private_key_pass_phrase()
            kid = CONFIG_OBJ.get_jwt_public_key_kid()

            # token timestamps
            created_at = datetime.now(timezone.utc)
            expires_at = created_at + timedelta(hours=lifetime)

            # create/encode the token
            token = token_encoder.encode(private_key=private_key, validity_in_seconds=validity, kid=kid,
                                         pass_phrase=pass_phrase)

            # Generate SHA256 hash
            token_hash = self.__generate_sha256(token=token)

            state = TokenState.Active
            if refresh:
                state = TokenState.Refreshed

            created_from = 'a.b.c.d'

            # Add token meta info to the database
            # TODO project name and remote IP
            DB_OBJ.add_token(user_id=token_encoder.claims["uuid"], user_email=token_encoder.claims["email"],
                             project_id=project, token_hash=token_hash, created_at=created_at,
                             expires_at=expires_at, state=state.value, project_name=project, created_from=created_from)

            return {self.TOKEN_HASH: token_hash,
                    self.CREATED_AT: created_at,
                    self.EXPIRES_AT: expires_at,
                    self.STATE: str(state),
                    self.CREATED_FROM: created_from,
                    self.ID_TOKEN: token}
        else:
            LOG.warning("JWT Token validator not initialized, skipping validation")

    def create_token(self, project: str, scope: str, ci_logon_id_token: str, refresh_token: str,
                     cookie: str = None, lifetime: int = 1) -> dict:
        """
        Generates key file and return authorization url for user to
        authenticate itself and also returns user id

        @param project: Project for which token is requested, by default it is set to 'all'
        @param scope: Scope of the requested token, by default it is set to 'all'
        @param ci_logon_id_token: CI logon Identity Token
        @param refresh_token: Refresh Token
        @param cookie: Vouch Proxy Cookie
        @param lifetime: Token lifetime in hours default(1 hour)

        @returns dict containing id_token and refresh_token
        @raises Exception in case of error
        """

        self.validate_scope(scope=scope)

        if project is None or scope is None:
            raise OAuthCredMgrError("CredMgr: Cannot request to create a token, "
                                    "Missing required parameter 'project' or 'scope'!")

        # Generate the Token
        result = self.__generate_token_and_save_info(ci_logon_id_token=ci_logon_id_token, project=project, scope=scope,
                                                     cookie=cookie, lifetime=lifetime)

        # Only include refresh token for short lived tokens
        if lifetime * 3600 == CONFIG_OBJ.get_token_life_time():
            result[self.REFRESH_TOKEN] = refresh_token
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

        try:
            new_refresh_token = new_token.pop(self.REFRESH_TOKEN)
            id_token = new_token.pop(self.ID_TOKEN)
        except KeyError:
            self.log.error("No refresh or id token returned")
            raise OAuthCredMgrError("No refresh or id token returned")
        self.log.debug(f"new_refresh_token: {new_refresh_token}")

        try:
            result = self.__generate_token_and_save_info(ci_logon_id_token=id_token, project=project, scope=scope,
                                                         cookie=cookie, refresh=True)
            result[self.REFRESH_TOKEN] = new_refresh_token
            return result
        except Exception as e:
            self.log.error(f"Exception error while generating Fabric Token: {e}")
            self.log.error(f"Failed generating the token but still returning refresh token")
            exception_string = str(e)
            if exception_string.__contains__("could not be associated with a pending flow"):
                exception_string = "Specified refresh token is expired and can not be found in the database."
            error_string = f"error: {exception_string}, {self.REFRESH_TOKEN}: {new_refresh_token}"
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
        self.log.debug("Response content=%s", response.content)
        self.log.debug(str(response.content, self.UTF_8))
        if response.status_code != 200:
            raise OAuthCredMgrError("Refresh token could not be revoked!")

    def revoke_identity_token(self, token_hash: str):
        # TODO
        pass

    def get_token_revoke_list(self, project_id: str, user_id: str) -> List[str]:
        # TODO
        pass

    def get_tokens(self, *, user_id: str, user_email: str, project_id: str, token_hash: str,
                   expires: datetime, states: List[str], offset: int, limit: int) -> List[Dict[str, Any]]:
        tokens = DB_OBJ.get_tokens(user_id=user_id, user_email=user_email, project_id=project_id,
                                   token_hash=token_hash, expires=expires,
                                   states=TokenState.translate_list(states=states),
                                   offset=offset, limit=limit)
        # Change the state from integer value to string
        for t in tokens:
            t[self.STATE] = str(TokenState(t[self.STATE]))

        return tokens

    @staticmethod
    def validate_scope(scope: str):
        allowed_scopes = CONFIG_OBJ.get_allowed_scopes()
        if scope not in allowed_scopes:
            raise OAuthCredMgrError(f"Scope {scope} is not allowed! Allowed scope values: {allowed_scopes}")
