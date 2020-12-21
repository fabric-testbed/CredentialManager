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
import jwt
from dateutil import tz

from fabric_cm.credmgr import CONFIG
from fabric_cm.credmgr.utils import LOG
from fabric_cm.credmgr.utils.jwt_manager import JWTManager
from fabric_cm.credmgr.utils.ldap import get_active_projects_and_roles_from_ldap
from fabric_cm.credmgr.utils.project_registry import ProjectRegistry


class FabricToken:
    """
    Implements class to transform CILogon ID token to Fabric Id Token
    by adding the project, scope and membership information to the token
    and signing with Fabric Certificate
    """
    def __init__(self, id_token, project="all", scope="all", cookie: str = None):
        """
        Constructor
        @param id_token: CI Logon Identity Token
        @param project: Project for which token is requested
        @param scope: Scope for which token is requested
        @param cookie: Vouch Proxy Cookie

        @raises Exception in case of error
        """
        if id_token is None or project is None or scope is None:
            raise TokenError("Missing required parameters id_token or project or scope")

        LOG.debug("id_token %s", id_token)
        self.id_token = id_token
        self.project = project
        self.scope = scope
        self.claims = jwt.decode(id_token, verify=False)
        self.encoded = False
        self.jwt = None
        self.cookie = cookie
        self.unset = True

    def generate_from_ci_logon_token(self, private_key: str, validity_in_seconds: int, kid: str,
                                     pass_phrase: str = None) -> str:
        """
        Generate Fabric Token by adding additional claims and signing with Fabric Cert
        @param private_key Private Key to sign the fabric_cm token
        @param validity_in_seconds Validity of the Token in seconds
        @param kid Public Key Id
        @param pass_phrase Pass Phrase for Private Key
        @return JWT String containing encoded Fabric Token
        """
        if self.encoded:
            LOG.info("Returning previously encoded token for project %s user %s" % (self.project, self.scope))
            return self.jwt

        self._add_fabric_claims()

        self.jwt = JWTManager.encode(validity=validity_in_seconds, claims=self.claims,
                                     private_key_file_name=private_key, pass_phrase=pass_phrase, kid=kid)
        self.encoded = True
        return self.jwt

    def _add_fabric_claims(self):
        """
        Set the claims for the Token by adding membership, project and scope
        """
        eppn = self.claims.get("eppn")
        email = self.claims.get("email")
        sub = self.claims.get("sub")

        use_project_registry = str(CONFIG.get('runtime', 'enable-project-registry'))
        projects = None
        roles = None
        if use_project_registry.lower() == 'false' or self.cookie is None:
            roles, projects = get_active_projects_and_roles_from_ldap(eppn, email)
        else:
            url = CONFIG.get('project-registry', 'project-registry-url')
            cert = CONFIG.get('project-registry', 'project-registry-cert')
            key = CONFIG.get('project-registry', 'project-registry-key')
            pass_phrase = CONFIG.get('project-registry', 'project-registry-pass-phrase')
            LOG.debug("Cookie: %s", self.cookie)
            project_registry = ProjectRegistry(url, self.cookie, self.id_token, cert, key, pass_phrase)
            roles, projects = project_registry.get_projects_and_roles(sub)

        LOG.debug("Projects: %s, Roles: %s", projects, roles)

        projects_to_be_removed = []
        for project in projects.keys():
            LOG.debug("Processing %s", project)
            if self.project != "all" and self.project not in project:
                projects_to_be_removed.append(project)
        for x in projects_to_be_removed:
            projects.pop(x)
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


class TokenError(Exception):
    """
    Token Exception
    """
