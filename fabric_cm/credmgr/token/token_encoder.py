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
    def __init__(self, id_token, idp_claims: dict, project: str, scope: str = "all", cookie: str = None):
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

        self._validate_lifetime(validity=validity_in_seconds)

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

    def _validate_lifetime(self, *, validity: int):
        """
        Set the claims for the Token by adding membership, project and scope
        """
        if validity == CONFIG_OBJ.get_token_life_time():
            return True

        core_api = CoreApi(api_server=CONFIG_OBJ.get_core_api_url(),
                           cookie=Utils.get_vouch_cookie(cookie=self.cookie, id_token=self.id_token,
                                                         claims=self.claims),
                           cookie_name=CONFIG_OBJ.get_vouch_cookie_name(),
                           cookie_domain=CONFIG_OBJ.get_vouch_cookie_domain_name())
        # TODO validate if the user is allowed to request long lived tokens
        return True

    def _add_fabric_claims(self):
        """
        Set the claims for the Token by adding membership, project and scope
        """
        if CONFIG_OBJ.is_core_api_enabled():
            core_api = CoreApi(api_server=CONFIG_OBJ.get_core_api_url(),
                               cookie=Utils.get_vouch_cookie(cookie=self.cookie, id_token=self.id_token,
                                                             claims=self.claims),
                               cookie_name=CONFIG_OBJ.get_vouch_cookie_name(),
                               cookie_domain=CONFIG_OBJ.get_vouch_cookie_domain_name())
            uuid, roles, projects = core_api.get_user_and_project_info(project_id=self.project)
        else:
            uuid = None
            email = self.claims.get("email")
            roles, tags = CmLdapMgrSingleton.get().get_user_and_project_info(eppn=None, email=email,
                                                                             project_id=self.project)
            projects = [{
                "uuid": self.project,
                "tags": tags
            }]

        LOG.debug(f"UUID: {uuid} Roles: {roles} Projects: {projects}")
        self.claims["projects"] = projects
        self.claims["roles"] = roles
        self.claims["scope"] = self.scope
        if uuid is not None:
            self.claims["uuid"] = uuid
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
