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
from typing import Tuple

import requests

from fabric_cm.credmgr.config import CONFIG_OBJ
from fabric_cm.credmgr.logging import LOG


class CoreApi:
    """
    Class implements functionality to interface with Project Registry
    """
    def __init__(self, api_server: str, cookie: str, cookie_name: str, cookie_domain: str):
        self.api_server = api_server
        self.cookie = cookie
        self.cookie_name = cookie_name
        self.cookie_domain = cookie_domain

    def get_user_and_project_info(self, project_id: str) -> Tuple[str, list, list]:
        """
        Determine User's info using CORE API
        :param project_id: Project Id
        :return the user uuid, roles, projects

        :returns a tuple containing user specific roles and project tags
        """
        if self.api_server is None or self.cookie is None:
            raise CoreApiError(f"Core URL: {self.api_server} or Cookie: {self.cookie} not available")

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
        ssl_verify = CONFIG_OBJ.is_core_api_ssl_verify()

        # WhoAmI
        url = f'{self.api_server}/whoami'
        response = s.get(url, verify=ssl_verify)
        if response.status_code != 200:
            raise CoreApiError(f"Core API error occurred status_code: {response.status_code} "
                               f"message: {response.content}")

        LOG.debug(f"GET WHOAMI Response : {response.json()}")
        uuid = response.json().get("results")[0]["uuid"]

        # Get Project
        if project_id.lower() == "all":
            # Get All projects
            url = f"{self.api_server}/projects?offset=0&limit=50&person_uuid={uuid}&sort_by=name&order_by=asc"
        else:
            url = f"{self.api_server}/projects/{project_id}"
        response = s.get(url, verify=ssl_verify)

        if response.status_code != 200:
            raise CoreApiError(f"Core API error occurred status_code: {response.status_code} "
                               f"message: {response.content}")

        LOG.debug(f"GET Project Response : {response.json()}")
        projects_res = response.json().get("results")

        if len(projects_res) == 0:
            raise CoreApiError(f"User is not a member of Project: {project_id}")

        projects = []
        for p in projects_res:
            project_memberships = p.get("memberships")

            if not project_memberships["is_member"] and not project_memberships["is_creator"] and \
                    not project_memberships["is_owner"]:
                raise CoreApiError(f"User is not a member of Project: {p.get('uuid')}")
            project = {
                "name": p.get("name"),
                "uuid": p.get("uuid")
            }

            # Only pass tags and membership when token is requested for a specific project
            if project_id.lower() != "all":
                project["tags"] = p.get("tags")
                project["memberships"] = p.get("memberships")

            projects.append(project)

        # Get User by UUID to get roles (Facility Operator is not Project Specific,
        # so need the roles from people end point)
        url = f"{self.api_server}/people/{uuid}?as_self=true"
        response = s.get(url, verify=ssl_verify)

        if response.status_code != 200:
            raise CoreApiError(f"Core API error occurred status_code: {response.status_code} "
                               f"message: {response.content}")

        LOG.debug(f"GET PEOPLE Response : {response.json()}")

        roles = response.json().get("results")[0]["roles"]
        return uuid, roles, projects


class CoreApiError(Exception):
    """
    Core Exception
    """
    pass
