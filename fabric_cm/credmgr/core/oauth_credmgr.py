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
import hmac
from datetime import datetime, timezone, timedelta
from enum import Enum
from typing import List, Dict, Any, Tuple

import jwt
import requests
from jwt import ExpiredSignatureError
from requests_oauthlib import OAuth2Session

from . import DB_OBJ
from fabric_cm.credmgr.config import CONFIG_OBJ
from fabric_cm.credmgr.logging import LOG, log_event
from fabric_cm.credmgr.token.token_encoder import TokenEncoder
from fabric_cm.credmgr.swagger_server import jwt_validator, jwk_public_key_rsa
from fss_utils.jwt_manager import ValidateCode

from http.client import INTERNAL_SERVER_ERROR, NOT_FOUND

from fabric_cm.credmgr.external_apis.litellm_api import LiteLLMApi, LiteLLMApiError
from ..common.utils import Utils


class OAuthCredMgrError(Exception):
    """
    CredMgr Exception
    """
    def __init__(self, message: str, http_error_code: int = INTERNAL_SERVER_ERROR):
        super().__init__(message)
        self.http_error_code = http_error_code

    def get_http_error_code(self) -> int:
        return self.http_error_code


class TokenState(Enum):
    Nascent = enum.auto()
    Valid = enum.auto()
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


class OAuthCredMgr:
    """
    Credential Manager class responsible for handling various operations supported by REST APIs
    It also provides support for scanning and cleaning up of expired tokens and key files.
    """
    ID_TOKEN = "id_token"
    REFRESH_TOKEN = "refresh_token"
    CREATED_AT = "created_at"
    EXPIRES_AT = "expires_at"
    TOKEN_HASH = "token_hash"
    COMMENT = "comment"
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
    UUID = "uuid"
    EMAIL = "email"
    PROJECTS = "projects"

    def __init__(self):
        self.log = LOG

    @staticmethod
    def __generate_token_hash(*, token: str) -> str:
        """
        Generate HMAC-SHA256 fingerprint for a high-entropy token.

        Uses a server-side secret (vouch secret) as the HMAC key so that
        database contents alone cannot be used to verify guessed tokens.

        @param token token string
        @return hex digest of the HMAC-SHA256
        """
        secret = CONFIG_OBJ.get_vouch_secret().encode('utf-8')
        return hmac.new(secret, token.encode('utf-8'), hashlib.sha256).hexdigest()

    def __generate_token_and_save_info(self, ci_logon_id_token: str, scope: str, remote_addr: str,
                                       comment: str = None, cookie: str = None, lifetime: int = 4,
                                       refresh: bool = False, project_id: str = None,
                                       project_name: str = None) -> Dict[str, str]:
        """
        Generate Fabric Token and save the corresponding meta information in the database
        @param ci_logon_id_token    CI logon Identity Token
        @param project_id           Project Id
        @param project_name         Project Name
        @param scope                Token scope; allowed values (cf, mf, all)
        @param remote_addr          Remote Address
        @param comment              Comment
        @param cookie               Vouch Cookie
        @param lifetime             Token lifetime in hours; default 1 hour; max is 9 weeks i.e. 1512 hours
        @param refresh              Flag indicating if token was refreshed (True) or created new (False)
        """
        if project_name is None and project_id is None:
            raise OAuthCredMgrError(f"CredMgr: Either Project ID: '{project_id}' or Project Name'{project_name}' "
                                    f"must be specified")

        self.log.debug("CILogon Token: %s", ci_logon_id_token)

        # validate the token
        if jwt_validator is not None:
            LOG.info("Validating CI Logon token")
            code, claims_or_exception = jwt_validator.validate_jwt(token=ci_logon_id_token)
            if code is not ValidateCode.VALID:
                LOG.error(f"Unable to validate provided token: {code}/{claims_or_exception}")
                raise claims_or_exception

            # Create an encoder
            token_encoder = TokenEncoder(id_token=ci_logon_id_token, idp_claims=claims_or_exception,
                                         project_id=project_id, project_name=project_name,
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
            token_hash = self.__generate_token_hash(token=token)

            state = TokenState.Valid
            action = "create"
            if refresh:
                state = TokenState.Refreshed
                comment = "Refreshed via API"
                action = "refresh"

            if comment is None:
                comment = "Created via GUI"

            # Delete any expired tokens
            self.delete_expired_tokens(user_email=token_encoder.claims.get(self.EMAIL),
                                       user_id=token_encoder.claims.get(self.UUID))

            # Add token meta info to the database
            DB_OBJ.add_token(user_id=token_encoder.claims.get(self.UUID),
                             user_email=token_encoder.claims.get(self.EMAIL),
                             project_id=token_encoder.project_id, token_hash=token_hash, created_at=created_at,
                             expires_at=expires_at, state=state.value, created_from=remote_addr,
                             comment=comment)

            log_event(token_hash=token_hash, action=action, project_id=token_encoder.project_id,
                      user_id=token_encoder.claims.get(self.UUID), user_email=token_encoder.claims.get(self.EMAIL))

            return {self.TOKEN_HASH: token_hash,
                    self.CREATED_AT: created_at.strftime(OAuthCredMgr.TIME_FORMAT),
                    self.EXPIRES_AT: expires_at.strftime(OAuthCredMgr.TIME_FORMAT),
                    self.STATE: str(state),
                    self.COMMENT: comment,
                    self.CREATED_FROM: remote_addr,
                    self.ID_TOKEN: token}
        else:
            LOG.warning("JWT Token validator not initialized, skipping validation")

    def create_token(self, project_id: str, project_name: str, scope: str, ci_logon_id_token: str, refresh_token: str,
                     remote_addr: str, user_email: str, comment: str = None, cookie: str = None,
                     lifetime: int = 4) -> dict:
        """
        Generates key file and return authorization url for user to
        authenticate itself and also returns user id

        @param project_id: Project Id of the project for which token is requested, by default it is set to 'all'
        @param project_name: Project Name
        @param scope: Scope of the requested token, by default it is set to 'all'
        @param ci_logon_id_token: CI logon Identity Token
        @param refresh_token: Refresh Token
        @param remote_addr: Remote Address
        @param user_email: User's email
        @param comment: Comment
        @param cookie: Vouch Proxy Cookie
        @param lifetime: Token lifetime in hours default(1 hour)

        @returns dict containing id_token and refresh_token
        @raises Exception in case of error
        """

        self.validate_scope(scope=scope)

        if project_name is None and project_id is None:
            raise OAuthCredMgrError(f"CredMgr: Either Project ID: '{project_id}' or Project Name'{project_name}' "
                                    f"must be specified")

        if scope is None:
            raise OAuthCredMgrError("CredMgr: Missing required parameter 'scope'!")

        if project_id is None:
            project_id = Utils.get_project_id(project_name=project_name, cookie=cookie)

        short = Utils.is_short_lived(lifetime_in_hours=lifetime)
        LOG.info(f"Token lifetime: {lifetime} short: {short}")

        if not short:
            long_lived_tokens = self.get_tokens(project_id=project_id, user_email=user_email)
            if long_lived_tokens is not None and len(long_lived_tokens) > CONFIG_OBJ.get_max_llt_per_project():
                raise OAuthCredMgrError(f"User: {user_email} already has {CONFIG_OBJ.get_max_llt_per_project()} "
                                        f"long lived tokens")

        # Generate the Token
        result = self.__generate_token_and_save_info(ci_logon_id_token=ci_logon_id_token, project_id=project_id,
                                                     scope=scope, remote_addr=remote_addr, cookie=cookie,
                                                     lifetime=lifetime, comment=comment, project_name=project_name)

        # Only include refresh token for short lived tokens
        if short:
            result[self.REFRESH_TOKEN] = refresh_token
        return result

    def refresh_token(self, refresh_token: str, project_id: str, project_name: str, scope: str,
                      remote_addr: str, cookie: str = None) -> dict:
        """
        Refreshes a token from CILogon and generates Fabric token using project and scope saved in Database

        @param project_id: Project Id of the project for which token is requested, by default it is set to 'all'
        @param project_name: Project Name
        @param scope: Scope of the requested token, by default it is set to 'all'
        @param refresh_token: Refresh Token
        @param remote_addr: Remote IP
        @param cookie: Vouch Proxy Cookie
        @returns dict containing id_token and refresh_token

        @raises Exception in case of error
        """
        if project_name is None and project_id is None:
            raise OAuthCredMgrError(f"CredMgr: Either Project ID: '{project_id}' or Project Name'{project_name}' "
                                    f"must be specified")

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
            result = self.__generate_token_and_save_info(ci_logon_id_token=id_token, project_id=project_id,
                                                         project_name=project_name, scope=scope,
                                                         cookie=cookie, refresh=True, remote_addr=remote_addr)
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

    def revoke_identity_token(self, token_hash: str, cookie: str, user_email: str = None, project_id: str = None,
                              token: str = None):
        """
         Revoke a fabric identity token

         :param token_hash: Token's hash
         :type token_hash: str
         :param user_email: User's email
         :type user_email: str
         :param cookie: Cookie
         :type cookie: str
         :param token: Token
         :type token: str

         @returns dictionary containing status of the operation
         @raises Exception in case of error
         """
        if user_email is None and token_hash is None:
            raise OAuthCredMgrError(f"User Id/Email or Token Hash required")

        # Facility Operator query all tokens
        if Utils.is_facility_operator(cookie=cookie, token=token):
            tokens = self.get_tokens(token_hash=token_hash)
        # Otherwise query only this user's tokens
        else:
            tokens = self.get_tokens(token_hash=token_hash, user_email=user_email, project_id=project_id)

        if tokens is None or len(tokens) == 0:
            raise OAuthCredMgrError(http_error_code=NOT_FOUND,
                                    message=f"Token# {token_hash} not found!")

        if tokens[0].get(self.STATE) == str(TokenState.Revoked):
            LOG.info(f"Token {token_hash} for user {tokens[0].get('user_email')}/{tokens[0].get('user_id')} "
                     f"is already revoked!")
            return
        DB_OBJ.update_token(token_hash=token_hash, state=TokenState.Revoked.value)

        log_event(token_hash=token_hash, action="revoke", project_id=tokens[0].get('project_id'),
                  user_id=tokens[0].get('user_id'), user_email=tokens[0].get('user_email'))

    def get_token_revoke_list(self, project_id: str, user_email: str = None, user_id: str = None) -> List[str]:
        """Get token revoke list i.e. list of revoked identity token hashes

        Get token revoke list i.e. list of revoked identity token hashes for a user in a project  # noqa: E501

        :param project_id: Project identified by universally unique identifier
        :type project_id: str
        :param user_email: User's email
        :type user_email: str
        :param user_id: User identified by universally unique identifier
        :type user_id: str

        @return list of sting
        """
        result = []

        tokens = self.get_tokens(project_id=project_id, user_email=user_email, user_id=user_id,
                                 states=[str(TokenState.Revoked)], query_all=True)
        if tokens is None:
            return result
        for t in tokens:
            result.append(t.get(self.TOKEN_HASH))
        return result

    def get_tokens(self, *, user_id: str = None, user_email: str = None, project_id: str = None, token_hash: str = None,
                   expires: datetime = None, states: List[str] = None, offset: int = 0,
                   limit: int = 5, query_all: bool = False) -> List[Dict[str, Any]]:
        """
        Get Tokens
        @return list of tokens
        """
        if not query_all and project_id is None and user_id is None and user_email is None and token_hash is None:
            raise OAuthCredMgrError(f"User Id/Email/Token Hash or Project Id required")

        self.delete_expired_tokens(user_email=user_email, user_id=user_id)
        tokens = DB_OBJ.get_tokens(user_id=user_id, user_email=user_email, project_id=project_id,
                                   token_hash=token_hash, expires=expires,
                                   states=TokenState.translate_list(states=states),
                                   offset=offset, limit=limit)
        now = datetime.now(timezone.utc)
        # Change the state from integer value to string
        for t in tokens:
            state = TokenState(t[self.STATE])
            if t.get(self.EXPIRES_AT) < now:
                state = TokenState.Expired
            t[self.STATE] = str(state)

        return tokens

    @staticmethod
    def validate_scope(scope: str):
        allowed_scopes = CONFIG_OBJ.get_allowed_scopes()
        if scope not in allowed_scopes:
            raise OAuthCredMgrError(f"Scope {scope} is not allowed! Allowed scope values: {allowed_scopes}")

    def delete_tokens(self, user_email: str = None, user_id: str = None, token_hash: str = None):
        """
        Delete Expired Tokens
        @param user_id user uuid
        @param user_email user email
        @param token_hash token hash
        """
        tokens = DB_OBJ.get_tokens(user_email=user_email, user_id=user_id, token_hash=token_hash)
        if tokens is None:
            return

        # Remove the expired tokens
        for t in tokens:
            DB_OBJ.remove_token(token_hash=t.get(self.TOKEN_HASH))
            log_event(token_hash=t.get(self.TOKEN_HASH), action="delete", project_id=tokens[0].get('project_id'),
                      user_id=tokens[0].get('user_id'), user_email=tokens[0].get('user_email'))

    def delete_expired_tokens(self, user_email: str = None, user_id: str = None):
        """
        Delete Expired Tokens
        @param user_id user uuid
        @param user_email user email
        """
        tokens = DB_OBJ.get_tokens(user_email=user_email, user_id=user_id, expires=datetime.now(timezone.utc))
        if tokens is None:
            return

        # Remove the expired tokens
        for t in tokens:
            DB_OBJ.remove_token(token_hash=t.get(self.TOKEN_HASH))
            log_event(token_hash=t.get(self.TOKEN_HASH), action="delete", project_id=tokens[0].get('project_id'),
                      user_id=tokens[0].get('user_id'), user_email=tokens[0].get('user_email'))

    def _ensure_llm_user_and_team(self, llm_api: LiteLLMApi, uuid: str, email: str):
        """
        Ensure user exists in the LLM proxy and is a member of the configured team.
        Creates user if not found, adds to team if not already a member.
        Best-effort: logs warnings on failure but does not block key generation,
        as users may have already been set up via the LLM proxy UI.
        @param llm_api LLM API client instance
        @param uuid FABRIC user UUID
        @param email User's email
        """
        # Step 1: Check if user exists in LLM proxy, create if not
        try:
            llm_api.get_user_info(user_id=uuid)
            LOG.info(f"LLM user {uuid} already exists")
        except LiteLLMApiError:
            try:
                LOG.info(f"Creating LLM user {uuid} ({email})")
                llm_api.create_user(user_id=uuid, user_email=email,
                                        max_budget=CONFIG_OBJ.get_llm_default_max_budget())
            except LiteLLMApiError as e:
                LOG.warning(f"Could not create LLM user {uuid}: {e}")

        # Step 2: Add user to team
        team_id = CONFIG_OBJ.get_llm_team_id()
        try:
            LOG.info(f"Adding LLM user {uuid} to team {team_id}")
            llm_api.add_user_to_team(team_id=team_id, user_id=uuid,
                                         max_budget_in_team=CONFIG_OBJ.get_llm_default_max_budget())
        except LiteLLMApiError as e:
            LOG.warning(f"Could not add user {uuid} to team {team_id}: {e}")

    def create_llm_key(self, cookie: str, key_name: str = None, comment: str = None,
                       duration_days: int = 30, models: list = None) -> dict:
        """
        Create an LLM API key for the user.
        Full workflow: verify FABRIC project membership → ensure LLM user → add to team → generate key.
        @param cookie Vouch cookie
        @param key_name Human-readable name for the key
        @param comment Comment
        @param duration_days Token duration in days (1-30)
        @return dict with api_key, llm_key_id, key_name, timestamps
        """
        from fabric_cm.credmgr.external_apis.core_api import CoreApi

        core_api = CoreApi(api_server=CONFIG_OBJ.get_core_api_url(), cookie=cookie,
                           cookie_name=CONFIG_OBJ.get_vouch_cookie_name(),
                           cookie_domain=CONFIG_OBJ.get_vouch_cookie_domain_name())

        uuid, email = core_api.get_user_id_and_email()

        # Verify user is an active member of the allowed FABRIC project
        allowed_project = CONFIG_OBJ.get_llm_allowed_project()
        projects = core_api.get_user_projects(project_id=allowed_project)

        if not projects:
            raise OAuthCredMgrError(f"User is not a member of project: {allowed_project}")

        project_found = False
        for p in projects:
            if not p.get("active", False):
                continue
            memberships = p.get("memberships", {})
            if memberships.get("is_member") or memberships.get("is_creator") or memberships.get("is_owner"):
                project_found = True
                break

        if not project_found:
            raise OAuthCredMgrError(f"User is not an active member of project: {allowed_project}")

        llm_api = LiteLLMApi(api_server=CONFIG_OBJ.get_llm_url(),
                                 master_key=CONFIG_OBJ.get_llm_api_key())

        # Ensure user exists in LLM proxy and is part of the team
        self._ensure_llm_user_and_team(llm_api, uuid, email)

        max_duration = int(CONFIG_OBJ.get_llm_default_duration().rstrip('d'))
        if duration_days is None or duration_days < 1:
            duration_days = max_duration
        if duration_days > max_duration:
            raise OAuthCredMgrError(f"Token duration cannot exceed {max_duration} days")
        duration = f"{duration_days}d"
        max_budget = CONFIG_OBJ.get_llm_default_max_budget()
        team_id = CONFIG_OBJ.get_llm_team_id()

        metadata = {'user_email': email, 'fabric_user_uuid': uuid}

        # Generate the key with team_id so it's associated with the team
        result = llm_api.generate_key(user_id=uuid, user_email=email, team_id=team_id,
                                          key_alias=key_name, duration=duration,
                                          max_budget=max_budget, metadata=metadata,
                                          models=models)

        api_key = result.get('key')
        llm_key_id = result.get('token')
        expires_at_str = result.get('expires')

        if api_key is None or llm_key_id is None:
            raise OAuthCredMgrError("LLM proxy did not return expected key data")

        api_key_hash = self.__generate_token_hash(token=api_key)
        created_at = datetime.now(timezone.utc)

        expires_at = None
        if expires_at_str is not None:
            try:
                expires_at = datetime.fromisoformat(expires_at_str.replace('Z', '+00:00'))
            except (ValueError, AttributeError):
                LOG.warning(f"Could not parse LLM expires value: {expires_at_str}")

        # Save record to local DB for audit trail
        DB_OBJ.add_llm_key(user_id=uuid, user_email=email, llm_key_id=llm_key_id,
                           llm_key_name=key_name, api_key_hash=api_key_hash,
                               created_at=created_at, expires_at=expires_at, comment=comment)

        log_event(token_hash=api_key_hash, action="create_llm_key", project_id=allowed_project,
                  user_id=uuid, user_email=email)

        return {
            'api_key': api_key,
            'llm_key_id': llm_key_id,
            'key_name': key_name,
            'created_at': created_at.strftime(OAuthCredMgr.TIME_FORMAT),
            'expires_at': expires_at.strftime(OAuthCredMgr.TIME_FORMAT) if expires_at else None,
            'comment': comment
        }

    def delete_llm_key(self, llm_key_id: str, user_email: str, cookie: str):
        """
        Delete an LLM API key
        @param llm_key_id LLM key identifier
        @param user_email User's email
        @param cookie Vouch cookie
        """
        llm_api = LiteLLMApi(api_server=CONFIG_OBJ.get_llm_url(),
                                 master_key=CONFIG_OBJ.get_llm_api_key())

        # Verify the key exists and belongs to user
        try:
            key_info = llm_api.get_key_info(key_id=llm_key_id)
        except LiteLLMApiError:
            raise OAuthCredMgrError(http_error_code=NOT_FOUND,
                                    message=f"LLM key {llm_key_id} not found")

        # Check ownership: key's user_id must match, or caller must be facility operator
        key_owner = key_info.get('info', {}).get('user_id', key_info.get('user_id'))
        from fabric_cm.credmgr.external_apis.core_api import CoreApi
        core_api = CoreApi(api_server=CONFIG_OBJ.get_core_api_url(), cookie=cookie,
                           cookie_name=CONFIG_OBJ.get_vouch_cookie_name(),
                           cookie_domain=CONFIG_OBJ.get_vouch_cookie_domain_name())
        uuid, email = core_api.get_user_id_and_email()

        if key_owner != uuid:
            if not Utils.is_facility_operator(cookie=cookie):
                raise OAuthCredMgrError(f"User {user_email} is not authorized to delete this key")

        llm_api.delete_key(key_id=llm_key_id)

        # Also remove from local DB if present
        try:
            DB_OBJ.remove_llm_key(llm_key_id=llm_key_id)
        except Exception:
            LOG.warning(f"LLM key {llm_key_id} not found in local DB (may have been created externally)")

        log_event(token_hash=llm_key_id, action="delete_llm_key",
                  project_id=CONFIG_OBJ.get_llm_allowed_project(),
                  user_id=uuid, user_email=email)

    def get_llm_keys(self, cookie: str, offset: int = 0, limit: int = 200) -> list:
        """
        Get LLM keys for a user by querying LLM proxy API directly.
        Expired keys are automatically deleted before returning the list.
        @param cookie Vouch cookie
        @param offset offset
        @param limit limit
        @return list of active (non-expired) LLM key records
        """
        from fabric_cm.credmgr.external_apis.core_api import CoreApi
        core_api = CoreApi(api_server=CONFIG_OBJ.get_core_api_url(), cookie=cookie,
                           cookie_name=CONFIG_OBJ.get_vouch_cookie_name(),
                           cookie_domain=CONFIG_OBJ.get_vouch_cookie_domain_name())
        uuid, email = core_api.get_user_id_and_email()

        llm_api = LiteLLMApi(api_server=CONFIG_OBJ.get_llm_url(),
                                 master_key=CONFIG_OBJ.get_llm_api_key())

        keys = llm_api.list_keys(user_id=uuid)

        # Delete expired keys automatically
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        active_keys = []
        for key in keys:
            expires_str = key.get('expires')
            if expires_str:
                try:
                    expires_dt = datetime.fromisoformat(expires_str.replace('Z', '+00:00'))
                    if expires_dt < now:
                        key_id = key.get('token')
                        if key_id:
                            try:
                                llm_api.delete_key(key_id=key_id)
                                try:
                                    DB_OBJ.remove_llm_key(llm_key_id=key_id)
                                except Exception:
                                    pass
                                LOG.info(f"Deleted expired LLM key {key_id} for user {uuid}")
                            except Exception as ex:
                                LOG.warning(f"Failed to delete expired LLM key {key_id}: {ex}")
                                active_keys.append(key)
                        continue
                except (ValueError, TypeError) as ex:
                    LOG.warning(f"Failed to parse expires field '{expires_str}': {ex}")
            active_keys.append(key)

        return active_keys

    def get_llm_models(self) -> dict:
        """
        Get available LLM models and the LLM API URL.
        @return dict with 'api_host' and 'models' list
        """
        llm_api = LiteLLMApi(api_server=CONFIG_OBJ.get_llm_url(),
                                 master_key=CONFIG_OBJ.get_llm_api_key())

        models = llm_api.list_models()
        model_list = []
        for m in models:
            model_id = m.get('id', '')
            model_list.append({'modelId': model_id})

        return {
            'api_host': CONFIG_OBJ.get_llm_url(),
            'models': model_list
        }

    def validate_token(self, *, token: str) -> Tuple[str, dict]:
        """
        Validate a token
        @param token token
        @return token state and claims
        """
        claims = {}
        # get kid from token
        try:
            kid = jwt.get_unverified_header(token).get('kid', None)
            alg = jwt.get_unverified_header(token).get('alg', None)
        except jwt.DecodeError as e:
            raise Exception(ValidateCode.UNPARSABLE_TOKEN)

        if kid is None:
            raise Exception(ValidateCode.UNSPECIFIED_KEY)

        if alg is None:
            raise Exception(ValidateCode.UNSPECIFIED_ALG)

        if kid != jwk_public_key_rsa['kid']:
            raise Exception(ValidateCode.UNKNOWN_KEY)

        key = jwt.algorithms.RSAAlgorithm.from_jwk(jwk_public_key_rsa)

        options = {"verify_exp": True, "verify_aud": True}

        # options https://pyjwt.readthedocs.io/en/latest/api.html
        try:
            claims = jwt.decode(token, key=key, algorithms=[alg], options=options,
                                audience=CONFIG_OBJ.get_oauth_client_id())

            # Check if the Token is Revoked
            token_hash = self.__generate_token_hash(token=token)
            token_found_in_db = self.get_tokens(token_hash=token_hash)
            if token_found_in_db is None or len(token_found_in_db) == 0:
                raise OAuthCredMgrError(http_error_code=NOT_FOUND, message="Token not found!")

            state = token_found_in_db[0].get(self.STATE)

        except ExpiredSignatureError:
            state = TokenState.Expired
        except Exception:
            raise Exception(ValidateCode.INVALID)

        return str(state), claims
