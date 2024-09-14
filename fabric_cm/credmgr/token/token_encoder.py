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
import re
from datetime import datetime
from dateutil import tz
from fss_utils.jwt_manager import JWTManager, ValidateCode

from fabric_cm.credmgr.common.utils import Utils
from fabric_cm.credmgr.config import CONFIG_OBJ
from fabric_cm.credmgr.external_apis.ldap import CmLdapMgrSingleton
from fabric_cm.credmgr.logging import LOG
from fabric_cm.credmgr.common.exceptions import TokenError
from fabric_cm.credmgr.external_apis.core_api import CoreApi


class TokenEncoder:
    """
    Implements class to transform CILogon ID token to Fabric Id Token
    by adding the project, scope and membership information to the token
    and signing with Fabric Certificate
    """
    PROJECTS = "projects"
    ROLES = "roles"
    UUID = "uuid"
    SCOPE = "scope"
    TAGS = "tags"
    EMAIL = "email"
    SUB = "sub"

    def __init__(self, id_token, idp_claims: dict, project_id: str = None, project_name: str = None,
                 scope: str = "all", cookie: str = None):
        """
        Constructor
        :param id_token: CI Logon Identity Token
        :param idp_claims: CI Logon Identity Claims
        :param project_id: Project Id of the project for which token is requested
        :param project_name: Project Name of the project for which token is requested
        :param scope: Scope for which token is requested
        :param cookie: Vouch Proxy Cookie

        :raises Exception in case of error
        """
        if id_token is None or (project_id is None and project_name is None) or scope is None:
            raise TokenError("Missing required parameters id_token or project or scope")

        self.id_token = id_token
        self.claims = idp_claims
        self.project_id = project_id
        self.project_name = project_name
        self.scope = scope
        self.cookie = cookie
        self.encoded = False
        self.token = None
        self.unset = True

    def encode(self, private_key: str, validity_in_seconds: int, kid: str, pass_phrase: str = None) -> str:
        """
        Generate Fabric Token by adding additional claims and signing with Fabric Cert
        :param private_key Private Key to sign the fabric_cm token
        :param validity_in_seconds Validity of the Token in seconds
        :param kid Public Key Id
        :param pass_phrase Pass Phrase for Private Key
        :return JWT String containing encoded Fabric Token
        """
        if self.encoded:
            return self.token

        self._add_fabric_claims()

        if not Utils.is_short_lived(lifetime_in_hours=int(validity_in_seconds/3600)) and \
                not self._validate_lifetime(validity=validity_in_seconds, project=self.claims[self.PROJECTS][0]):
            raise TokenError(f"User {self.claims[self.EMAIL]} is not authorized to create long lived tokens!")

        code, token_or_exception = JWTManager.encode_and_sign_with_private_key(validity=validity_in_seconds,
                                                                               claims=self.claims,
                                                                               private_key_file_name=private_key,
                                                                               pass_phrase=pass_phrase, kid=kid,
                                                                               algorithm='RS256')
        if code != ValidateCode.VALID:
            LOG.error(f"Failed to encode the Fabric Token: {token_or_exception}")
            raise token_or_exception

        self.token = token_or_exception
        self.encoded = True
        return self.token

    def _validate_lifetime(self, *, validity: int, project: dict):
        """
        Set the claims for the Token by adding membership, project and scope
        """
        if validity == CONFIG_OBJ.get_token_life_time():
            return True

        if project.get("memberships") and project.get("memberships").get("is_token_holder"):
            return True

        return False

    # Function to exclude roles with name containing UUIDs
    @staticmethod
    def exclude_uuid_roles(*, claims):
        if "roles" in claims:
            claims["roles"] = [role for role in claims["roles"] if not re.search(
                r'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', role["name"])]
        return claims

    def _add_fabric_claims(self):
        """
        Set the claims for the Token by adding membership, project and scope
        """
        if CONFIG_OBJ.is_core_api_enabled():
            cookie = Utils.get_vouch_cookie(cookie=self.cookie, id_token=self.id_token,
                                            claims=self.claims)

            if self.project_id is None:
                self.project_id = Utils.get_project_id(project_name=self.project_name, cookie=cookie)

            core_api = CoreApi(api_server=CONFIG_OBJ.get_core_api_url(),
                               cookie=cookie,
                               cookie_name=CONFIG_OBJ.get_vouch_cookie_name(),
                               cookie_domain=CONFIG_OBJ.get_vouch_cookie_domain_name())
            email, uuid, roles, projects = core_api.get_user_and_project_info(project_id=self.project_id)
        else:
            uuid = None
            email = self.claims.get(self.EMAIL)
            sub = self.claims.get(self.SUB)
            email, roles, tags = CmLdapMgrSingleton.get().get_user_and_project_info(eppn=None, email=email, sub=sub,
                                                                                    project_id=self.project_id)
            projects = [{
                self.UUID: self.project_id,
                self.TAGS: tags
            }]

        LOG.debug(f"UUID: {uuid} Roles: {roles} Projects: {projects}")
        self.claims[self.PROJECTS] = projects
        self.claims[self.ROLES] = roles
        self.claims[self.SCOPE] = self.scope
        if uuid is not None:
            self.claims[self.UUID] = uuid
        if self.claims.get(self.EMAIL) is None:
            self.claims[self.EMAIL] = email
        self.exclude_uuid_roles(claims=self.claims)
        LOG.debug("Claims %s", self.claims)
        self.unset = False

    @staticmethod
    def get_local_from_utc(utc: int) -> datetime:
        """ convert UTC in claims (iat and exp) into a python
        datetime object """
        return datetime.fromtimestamp(utc, tz.tzlocal())

    def __repr__(self) -> str:
        return self.__str__()

    def __str__(self) -> str:
        if self.unset:
            return "JWT not initialized"

        fstring = f"Token for {self.claims['sub']}/{self.claims['name']}:"

        if 'iat' in self.claims:
            fstring += f"\n\tIssued on: " \
                       f"{self.get_local_from_utc(self.claims['iat']).strftime('%Y-%m-%d %H:%M:%S')}"
        if 'exp' in self.claims:
            fstring += f"\n\tExpires on: " \
                       f"{self.get_local_from_utc(self.claims['exp']).strftime('%Y-%m-%d %H:%M:%S')}"

        return fstring