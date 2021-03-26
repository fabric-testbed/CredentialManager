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
from dateutil import tz
from fss_utils.jwt_manager import JWTManager, ValidateCode
from fss_utils.vouch_encoder import VouchEncoder, CustomClaimsType, PTokens

from fabric_cm.credmgr.config import CONFIG_OBJ
from fabric_cm.credmgr.logging import LOG
from fabric_cm.credmgr.common.exceptions import TokenError
from fabric_cm.credmgr.external_apis.project_registry import ProjectRegistry


class FabricTokenEncoder:
    """
    Implements class to transform CILogon ID token to Fabric Id Token
    by adding the project, scope and membership information to the token
    and signing with Fabric Certificate
    """
    def __init__(self, id_token, idp_claims: dict, project="all", scope="all", cookie: str = None):
        """
        Constructor
        :param id_token: CI Logon Identity Token
        :param idp_claims: CI Logon Identity Claims
        :param project: Project for which token is requested
        :param scope: Scope for which token is requested
        :param cookie: Vouch Proxy Cookie

        :raises Exception in case of error
        """
        if id_token is None or project is None or scope is None:
            raise TokenError("Missing required parameters id_token or project or scope")

        LOG.debug("id_token %s", id_token)
        self.id_token = id_token
        self.claims = idp_claims
        self.project = project
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

    def _get_vouch_cookie(self) -> str:
        vouch_cookie_enabled = CONFIG_OBJ.is_vouch_cookie_enabled()
        if not vouch_cookie_enabled or self.cookie is not None:
            return self.cookie

        vouch_secret = CONFIG_OBJ.get_vouch_secret()
        vouch_compression = CONFIG_OBJ.is_vouch_cookie_compressed()
        vouch_claims = CONFIG_OBJ.get_vouch_custom_claims()
        vouch_cookie_lifetime = CONFIG_OBJ.get_vouch_cookie_lifetime()
        vouch_helper = VouchEncoder(secret=vouch_secret, compression=vouch_compression)

        custom_claims = []
        for c in vouch_claims:
            c_type = c.strip().upper()

            if c_type == CustomClaimsType.OPENID.name:
                custom_claims.append(CustomClaimsType.OPENID)

            if c_type == CustomClaimsType.EMAIL.name:
                custom_claims.append(CustomClaimsType.EMAIL)

            if c_type == CustomClaimsType.PROFILE.name:
                custom_claims.append(CustomClaimsType.PROFILE)

            if c_type == CustomClaimsType.CILOGON_USER_INFO.name:
                custom_claims.append(CustomClaimsType.CILOGON_USER_INFO)

        p_tokens = PTokens(id_token=self.id_token, idp_claims=self.claims)

        code, cookie_or_exception = vouch_helper.encode(custom_claims_type=custom_claims, p_tokens=p_tokens,
                                                        validity_in_seconds=vouch_cookie_lifetime)

        if code != ValidateCode.VALID:
            LOG.error(f"Failed to encode the Vouch Cookie: {cookie_or_exception}")
            raise cookie_or_exception

        return cookie_or_exception

    def _add_fabric_claims(self):
        """
        Set the claims for the Token by adding membership, project and scope
        """
        sub = self.claims.get("sub")
        url = CONFIG_OBJ.get_pr_url()
        project_registry = ProjectRegistry(api_server=url, cookie=self._get_vouch_cookie(),
                                           cookie_name=CONFIG_OBJ.get_vouch_cookie_name(),
                                           cookie_domain=CONFIG_OBJ.get_vouch_cookie_domain_name())
        roles, projects = project_registry.get_projects_and_roles(sub)

        LOG.debug("Projects: %s, Roles: %s", projects, roles)

        projects_to_be_removed = []
        for project in projects.keys():
            LOG.debug("Processing %s", project)
            if self.project != "all" and self.project not in project:
                projects_to_be_removed.append(project)
        for x in projects_to_be_removed:
            projects.pop(x)

        if len(projects) < 1:
            raise TokenError("User is not a member of any of the project")
        self.claims['projects'] = projects
        self.claims["roles"] = roles
        self.claims["scope"] = self.scope
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
