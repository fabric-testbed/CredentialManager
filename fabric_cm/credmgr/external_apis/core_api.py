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
import datetime
from typing import Tuple, List

import requests

from fabric_cm.credmgr.config import CONFIG_OBJ
from fabric_cm.credmgr.logging import LOG


class CoreApi:
    """
    Class implements functionality to interface with Project Registry
    """
    def __init__(self, api_server: str, cookie: str, cookie_name: str, cookie_domain: str, token: str = None):
        self.api_server = api_server
        self.cookie = cookie
        self.cookie_name = cookie_name
        self.cookie_domain = cookie_domain
        self.token = token

        if self.api_server is None:
            raise CoreApiError(f"Core URL: {self.api_server} not available")

        if self.cookie is None and self.token is None:
            raise CoreApiError(f"Either cookie or token must be specified!")

        # Set the headers
        headers = {
            'Accept': 'application/json',
            'Content-Type': "application/json"
        }

        # Create Session
        self.session = requests.Session()

        if cookie is not None:
            # Set the Cookie
            cookie_obj = requests.cookies.create_cookie(
                name=self.cookie_name,
                value=self.cookie
            )
            self.session.cookies.set_cookie(cookie_obj)
            LOG.debug(f"Using vouch cookie: {self.session.cookies}")
        else:
            headers['authorization'] = f"Bearer {token}"

        self.session.headers.update(headers)

    def get_user_id_and_email(self) -> Tuple[str, str]:
        """
        Return User's uuid by querying via /whoami Core API
        @return User's uuid
        """
        url = f'{self.api_server}/whoami'
        response = self.session.get(url, verify=CONFIG_OBJ.is_core_api_ssl_verify())
        if response.status_code != 200:
            raise CoreApiError(f"Core API error occurred status_code: {response.status_code} "
                               f"message: {response.content}")

        LOG.debug(f"GET WHOAMI Response : {response.json()}")
        uuid = response.json().get("results")[0]["uuid"]
        email = response.json().get("results")[0]["email"]
        return uuid, email

    def get_user_roles(self, uuid: str):
        """
        Get User by UUID to get roles (Facility Operator is not Project Specific
        @param uuid User's uuid
        @return return user's roles
        """
        # Get User by UUID to get roles (Facility Operator is not Project Specific,
        # so need the roles from people end point)
        url = f"{self.api_server}/people/{uuid}?as_self=true"
        response = self.session.get(url, verify=CONFIG_OBJ.is_core_api_ssl_verify())

        if response.status_code != 200:
            raise CoreApiError(f"Core API error occurred status_code: {response.status_code} "
                               f"message: {response.content}")

        LOG.debug(f"GET PEOPLE Response : {response.json()}")

        roles = response.json().get("results")[0]["roles"]
        return roles

    def __get_user_project_by_id(self, *, project_id: str):
        url = f"{self.api_server}/projects/{project_id}"
        response = self.session.get(url, verify=CONFIG_OBJ.is_core_api_ssl_verify())

        if response.status_code != 200:
            raise CoreApiError(f"Core API error occurred status_code: {response.status_code} "
                               f"message: {response.content}")

        LOG.debug(f"GET Project Response : {response.json()}")

        return response.json().get("results")

    def __get_user_projects(self, *, project_name: str = None):
        offset = 0
        limit = 50
        uuid, email = self.get_user_id_and_email()
        result = []
        total_fetched = 0

        while True:
            if project_name is not None:
                url = f"{self.api_server}/projects?search={project_name}&offset={offset}&limit={limit}" \
                      f"&person_uuid={uuid}&sort_by=name&order_by=asc"
            else:
                url = f"{self.api_server}/projects?offset={offset}&limit={limit}&person_uuid={uuid}" \
                      f"&sort_by=name&order_by=asc"

            response = self.session.get(url, verify=CONFIG_OBJ.is_core_api_ssl_verify())

            if response.status_code != 200:
                raise CoreApiError(f"Core API error occurred status_code: {response.status_code} "
                                   f"message: {response.content}")

            LOG.debug(f"GET Project Response : {response.json()}")

            size = response.json().get("size")
            total = response.json().get("total")
            projects = response.json().get("results")

            total_fetched += size

            for x in projects:
                result.append(x)

            if total_fetched == total:
                break
            offset = size
            limit += limit

        return result

    def get_user_projects(self, project_name: str = None, project_id: str = None) -> List[dict]:
        if project_id is not None and project_id != "all":
            return self.__get_user_project_by_id(project_id=project_id)
        elif project_name is not None and project_name != "all":
            return self.__get_user_projects(project_name=project_name)
        else:
            return self.__get_user_projects()

    def get_user_and_project_info(self, project_id: str) -> Tuple[str, str, list, list]:
        """
        Determine User's info using CORE API
        :param project_id: Project Id
        :return the user uuid, roles, projects

        :returns a tuple containing user specific roles and project tags
        """
        uuid, email = self.get_user_id_and_email()

        projects_res = self.get_user_projects(project_id=project_id)

        projects = []
        for p in projects_res:
            active = p.get("active", False)
            if not active:
                # Do not include the expired project in the token for "all" get slices
                if project_id.lower() == "all":
                    continue
                # Fail a request of the token for a non-active project
                else:
                    raise CoreApiError(f"Project {p.get('name')} is not active!")

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

        if len(projects) == 0:
            raise CoreApiError(f"User is not a member of Project: {project_id}")

        roles = self.get_user_roles(uuid=uuid)
        return email, uuid, roles, projects


class CoreApiError(Exception):
    """
    Core Exception
    """
    pass