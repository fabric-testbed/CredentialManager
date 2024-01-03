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
from fabric_cm.credmgr.external_apis.core_api import CoreApi

from fabric_cm.credmgr.logging import LOG
from fss_utils.jwt_manager import ValidateCode
from fss_utils.vouch_encoder import VouchEncoder, CustomClaimsType, PTokens

from fabric_cm.credmgr.config import CONFIG_OBJ


class Utils:
    @staticmethod
    def get_vouch_cookie(*, cookie: str, id_token: str, claims: dict) -> str:
        """
        Build vouch cookie provided identity token and claims
        @param cookie cookie
        @param id_token identity token
        @param claims claims
        @return Vouch cookie
        """
        vouch_cookie_enabled = CONFIG_OBJ.is_vouch_cookie_enabled()
        if not vouch_cookie_enabled or cookie is not None:
            return cookie

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

        p_tokens = PTokens(id_token=id_token, idp_claims=claims)

        code, cookie_or_exception = vouch_helper.encode(custom_claims_type=custom_claims, p_tokens=p_tokens,
                                                        validity_in_seconds=vouch_cookie_lifetime)

        if code != ValidateCode.VALID:
            LOG.error(f"Failed to encode the Vouch Cookie: {cookie_or_exception}")
            raise cookie_or_exception

        return cookie_or_exception

    @staticmethod
    def is_facility_operator(*, cookie: str, token: str = None):
        """
        Validate if user with provided vouch cookie a facility operator
        @param cookie cookie
        @param token token
        @return True if user is FP; False otherwise
        """
        core_api = CoreApi(api_server=CONFIG_OBJ.get_core_api_url(), cookie=cookie,
                           cookie_name=CONFIG_OBJ.get_vouch_cookie_name(),
                           cookie_domain=CONFIG_OBJ.get_vouch_cookie_domain_name(),
                           token=token)
        uuid, email = core_api.get_user_id_and_email()
        roles = core_api.get_user_roles(uuid=uuid)

        if CONFIG_OBJ.get_facility_operator_role() in roles:
            return True
        return False

    @staticmethod
    def is_short_lived(*, lifetime_in_hours: int):
        if lifetime_in_hours * 3600 <= CONFIG_OBJ.get_token_life_time():
            return True
        return False

    @staticmethod
    def get_user_email(*, cookie: str):
        core_api = CoreApi(api_server=CONFIG_OBJ.get_core_api_url(), cookie=cookie,
                           cookie_name=CONFIG_OBJ.get_vouch_cookie_name(),
                           cookie_domain=CONFIG_OBJ.get_vouch_cookie_domain_name())
        uuid, email = core_api.get_user_id_and_email()
        return email

    @staticmethod
    def get_project_id(*, project_name: str, cookie: str):
        """
        Get the project Id for the given project name via Core API
        @param project_name project name
        @param cookie cookie
        @return True if user is FP; False otherwise
        """
        core_api = CoreApi(api_server=CONFIG_OBJ.get_core_api_url(), cookie=cookie,
                           cookie_name=CONFIG_OBJ.get_vouch_cookie_name(),
                           cookie_domain=CONFIG_OBJ.get_vouch_cookie_domain_name())

        projects = core_api.get_user_projects(project_name=project_name)

        if len(projects) == 0:
            raise Exception(f"Project '{project_name}' not found!")

        if len(projects) > 1:
            raise Exception(f"More than one project found with name '{project_name}'!")

        if projects[0].get("uuid") is None:
            raise Exception(f"Project Id for project '{project_name}' could not be found!")

        return projects[0].get("uuid")
