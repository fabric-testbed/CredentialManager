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
import requests

from fabric_cm.credmgr.config import CONFIG_OBJ
from fabric_cm.credmgr.logging import LOG


class ProjectRegistry:
    """
    Class implements functionality to interface with Project Registry
    """
    def __init__(self, api_server: str, cookie: str, cookie_name: str, cookie_domain: str):
        self.api_server = api_server
        self.cookie = cookie
        self.cookie_name = cookie_name
        self.cookie_domain = cookie_domain

    def get_projects_and_roles(self, sub: str):
        """
        Determine Role from Project Registry
        :param sub: OIDC claim sub
        :param returns the roles and project with tags

        :returns a tuple containing user specific roles and project tags
        """
        if self.api_server is None or self.cookie is None:
            raise ProjectRegistryError(f"Project Registry URL: {self.api_server} or "
                                       "Cookie: {self.cookie} not available")

        # Create Session
        s = requests.Session()

        # Set the Cookie
        cookie_obj = requests.cookies.create_cookie(
            name=self.cookie_name,
            value=self.cookie
        )
        s.cookies.set_cookie(cookie_obj)
        LOG.debug(f"Using vouch cookie: {s.cookies}")

        # Set the headers
        headers = {
            'Accept': 'application/json',
            'Content-Type': "application/json"
        }
        s.headers.update(headers)

        # Get User by OIDC SUB Claim
        url = self.api_server + "/people/oidc_claim_sub?oidc_claim_sub={}".format(sub)
        ssl_verify = CONFIG_OBJ.is_pr_ssl_verify()
        response = s.get(url, verify=ssl_verify)

        if response.status_code != 200:
            raise ProjectRegistryError(f"Project Registry error occurred "
                                       f"status_code: {response.status_code} message: {response.content}")

        LOG.debug(f"Response : {response.json()}")

        roles = response.json().get('roles', None)
        projects = response.json().get('projects', None)

        # Get Per Project Tags
        project_tags = {}
        for p in projects:
            project_name = p.get('name', None)
            project_uuid = p.get('uuid', None)
            LOG.debug(f"Getting tags for Project: {project_name}")
            url = self.api_server + "/projects/{}".format(project_uuid)
            response = s.get(url, verify=ssl_verify)
            if response.status_code != 200:
                raise ProjectRegistryError(f"Project Registry error occurred "
                                           f"status_code: {response.status_code} message: {response.content}")
            project_tags[project_name] = response.json().get('tags', None)
        return roles, project_tags


class ProjectRegistryError(Exception):
    """
    Project Registry Exception
    """
    pass
