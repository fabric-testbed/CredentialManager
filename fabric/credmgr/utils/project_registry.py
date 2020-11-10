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
Project Registry Interface
"""
import requests


class ProjectRegistry:
    """
    Class implements functionality to interface with Project Registry
    """
    def __init__(self, api_server: str, cookie: str):
        self.api_server = api_server
        self.cookie = cookie

    @staticmethod
    def _headers() -> dict:
        """
        Returns the headers
        @return dict containing header info
        """
        headers = {
            'Accept': 'application/json',
            'Content-Type': "application/json",
        }
        return headers

    def get_roles(self, sub: str):
        """
        Determine Role from Project Registry
        @param sub: OIDC claim sub
        @param returns the roles
        """
        if self.api_server is None or self.cookie is None:
            raise ProjectRegistryError("Project Registry URL: {} or "
                                       "Cookie: {} not available".format(
                self.api_server, self.cookie))

        url = self.api_server + "/people/oidc_claim_sub?oidc_claim_sub={}".format(sub)
        response = requests.get(url, headers=self._headers())

        if response.status_code != 200:
            raise ProjectRegistryError("Project Registry error occurred "
                                       "status_code: {} message: {}".format(
                response.status_code, response.content))

        return response.json()['roles']


class ProjectRegistryError(Exception):
    """
    Project Registry Exception
    """
    pass