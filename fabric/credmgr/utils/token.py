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
import json
from datetime import datetime, timedelta

import jwt
import requests
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from dateutil import tz

from fabric.credmgr import CONFIG
from fabric.credmgr.utils import LOG
from fabric.credmgr.utils.ldap import get_active_projects_from_ldap
from fabric.credmgr.utils.project_registry import ProjectRegistry

"""
Module to convert CI Logon token to Fabric Token
"""


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
            raise FabricTokenError("Missing required parameters id_token or project or scope")

        LOG.debug("id_token %s", id_token)
        self.jwks_url = CONFIG.get("oauth", "oauth-jwks-url")
        self.public_key = CONFIG.get("jwt", "jwt-public-key")
        self.private_key = CONFIG.get("jwt", "jwt-private-key")
        self.pass_phrase = CONFIG.get("jwt", "jwt-pass-phrase")
        LOG.debug(self.pass_phrase)
        self.id_token = id_token
        self.project = project
        self.scope = scope
        self.claims = None
        self.unset = True
        self.encoded = False
        self.jwt = None
        self.cookie = cookie

    def set_claims(self):
        """
        Set the claims for the Token by adding membership, project and scope
        """
        eppn = self.claims.get("eppn")
        email = self.claims.get("email")
        sub = self.claims.get("sub")

        use_project_registry = str(CONFIG.get('runtime', 'enable-project-registry'))
        projects = None
        if use_project_registry.lower() == 'false' or self.cookie is None:
            projects = get_active_projects_from_ldap(eppn, email)
        else:
            url = CONFIG.get('project-registry', 'project-registry-url')
            project_registry = ProjectRegistry(url, self.cookie)
            projects = project_registry.get_roles(sub)

        LOG.debug(projects)

        project_list = []
        for p in projects:
            LOG.debug("Processing %s", p)
            if self.project == "all" or self.project in p:
                project_list.append(p)
        LOG.debug(project_list)
        self.claims["roles"] = project_list
        self.claims["scope"] = self.scope
        self.claims["project"] = self.project
        LOG.debug(self.claims)
        self.unset = False

    def encode(self, validity: timedelta) -> str:
        """
        sign and base64 encode the token

        @return Returns the encoded string for the Fabric token
        """
        if self.unset:
            raise FabricTokenError("Claims not initialized, unable to encode")

        if self.encoded:
            LOG.info("Returning previously encoded token for project %s user %s" % (self.project, self.scope))
            return self.jwt

        if self.pass_phrase is not None and self.pass_phrase != "":
            self.pass_phrase = self.pass_phrase.encode("utf-8")
        else:
            self.pass_phrase = None

        with open(self.private_key) as private_key_fh:
            pem_data = private_key_fh.read()
            private_key_fh.close()
            private_key = serialization.load_pem_private_key(data=pem_data.encode("utf-8"),
                                                             password=self.pass_phrase,
                                                             backend=default_backend())

        self.claims['iat'] = int(datetime.now().timestamp())
        self.claims['exp'] = int((datetime.now() + validity).timestamp())

        self.jwt = str(jwt.encode(self.claims, private_key, algorithm='RS256'), 'utf-8')
        self.encoded = True
        return self.jwt

    def decode(self, ci_logon: bool = True, verify: bool = True):
        """
        Decode token

        @param ci_logon: true if CI Logon id token to be decoded;
                         false is Fabric token to be decoded
        @param verify: verify signature and expiration date if True
        """
        try:
            if ci_logon:
                response = requests.get(self.jwks_url)
                if response.status_code != 200:
                    return
                jwks = response.json()
                public_keys = {}
                for jwk in jwks['keys']:
                    kid = jwk['kid']
                    public_keys[kid] = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(jwk))

                kid = jwt.get_unverified_header(self.id_token)['kid']
                key = public_keys[kid]
            else:
                if self.unset:
                    raise FabricTokenError("JWT not initialized")

                if not self.encoded:
                    raise FabricTokenError("Token already in decoded form")

                if self.public_key is None:
                    LOG.info("Decoding token without verification of origin or date")
                    verify = False

                with open(self.public_key) as fh:
                    key = fh.read()
                    fh.close()

            options = {'verify_aud': False}
            self.claims = jwt.decode(self.id_token, key=key, verify=verify, algorithms=['RS256'], options=options)

            LOG.debug("Decoded Token %s", json.dumps(self.claims))
        except Exception as ex:
            LOG.error(ex)
            raise ex

    def valid_until(self) -> datetime:
        """
        Returns time until when the token is valid
        @return time until when the token is valid
        """
        if self.unset:
            raise FabricTokenError("Claims not initialized")

        if 'exp' in self.claims:
            return self.get_local_from_utc(self.claims['exp'])

        raise FabricTokenError("Expiration claim not present")

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


class FabricTokenError(Exception):
    pass


def main():
    """ simple test harness """
    id_token = "eyJ0eXAiOiJKV1QiLCJraWQiOiIyNDRCMjM1RjZCMjhFMzQxMDhEMTAxRUFDNzM2MkM0RSIsImFsZy" \
               "I6IlJTMjU2In0.eyJpc3MiOiJodHRwczovL2NpbG9nb24ub3JnIiwic3ViIjoiaHR0cDovL2NpbG9nb24" \
               "ub3JnL3NlcnZlckEvdXNlcnMvMTE5MDQxMDEiLCJhdWQiOiJjaWxvZ29uOi9jb GllbnRfaWQvNzdlMWF" \
               "lYTAyMGE0Njc2OTM3ZWFhMjJkZjFkNDMyZDgiLCJhdXRoX3RpbWUiOiIxNTg0MTk1MDUyIiwiZXhwIjoxNT" \
               "g0MTk1OTUzLCJpYXQiOjE1ODQxOT UwNTMsImVtYWlsIjoia3RoYXJlMTBAZW1haWwudW5jLmVkdSIsImdpdmV" \
               "uX25hbWUiOiJLb21hbCIsImZhbWlseV9uYW1lIjoiVGhhcmVqYSIsImNlcnRfc3ViamVjdF9 kbiI6Ii9EQz1vcm" \
               "cvREM9Y2lsb2dvbi9DPVVTL089VW5pdmVyc2l0eSBvZiBOb3J0aCBDYXJvbGluYSBhdCBDaGFwZWwgSGlsbC9DTj1L" \
               "b21hbCBUaGFyZWphIEExMTkw NDEwNiIsImlkcCI6InVybjptYWNlOmluY29tbW9uOnVuYy5lZHUiLCJpZHBfbm" \
               "FtZSI6IlVuaXZlcnNpdHkgb2YgTm9ydGggQ2Fyb2xpbmEgYXQgQ2hhcGVsIEhpbGwiL CJlcHBuIjoia3RoYXJl" \
               "MTBAdW5jLmVkdSIsImFmZmlsaWF0aW9uIjoiZW1wbG95ZWVAdW5jLmVkdTtzdGFmZkB1bmMuZWR1O21lbWJlckB" \
               "1bmMuZWR1IiwibmFtZSI6Ik tvbWFsIFRoYXJlamEiLCJhY3IiOiJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoy" \
               "LjA6YWM6Y2xhc3NlczpQYXNzd29yZFByb3RlY3RlZFRyYW5zcG9ydCIsImVudGl0bGV tZW50IjoidXJuOm1hY" \
               "2U6ZGlyOmVudGl0bGVtZW50OmNvbW1vbi1saWItdGVybXMifQ.GNHSbN6Ftq8rAfY-GEr0oJe8VXd9sBwyih0" \
               "Q05sD6Mg-0PdTwyqSODJNv--vSS5o9i6Zi_JGKvjCxCg4ce30JuB_OCmY0zDwLaedBzILlfVmwbuwAQMn" \
               "zg9yxBGqSW8O2tdoMVqausjQj6BZ5EuUA9pvT-IwK6lDJPVvTZ42FURsJfZXCyRSqafxXrJFQ" \
               "g7-fHxY6KmG2RY_J8ChOKN07o519G0Tr8N4pmqmGa5j0FIACyL4tznFY8yJ6ccBLxxEMGDqIMHO_X" \
               "c-P0b6powF4_6CktLX3Qqf_2w8hquvDqa_e6OHd8uNbuA3kcGuMhFdu2M8r0byzEIJjhSSYXM_vw"
    tok = FabricToken(id_token)
    tok.decode()
    print(tok)
    tok.set_claims()
    print(tok)


if __name__ == "__main__":
    main()
