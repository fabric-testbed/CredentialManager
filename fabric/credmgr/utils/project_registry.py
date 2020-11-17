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
from requests.adapters import HTTPAdapter
from urllib3.util.ssl_ import create_urllib3_context


class SSLAdapter(HTTPAdapter):
    """
    Implements SSL Adapter to pass SSL certfifcate and key along with passphrase
    """
    def __init__(self, certfile, keyfile, password=None, *args, **kwargs):
        self._certfile = certfile
        self._keyfile = keyfile
        self._password = password
        super(self.__class__, self).__init__(*args, **kwargs)

    def init_poolmanager(self, *args, **kwargs):
        """
        Initialize the pool manager
        """
        self._add_ssl_context(kwargs)
        return super(self.__class__, self).init_poolmanager(*args, **kwargs)

    def proxy_manager_for(self, *args, **kwargs):
        """
        Create proxy manager
        """
        self._add_ssl_context(kwargs)
        return super(self.__class__, self).proxy_manager_for(*args, **kwargs)

    def _add_ssl_context(self, kwargs):
        """
        Add SSL Context
        """
        context = create_urllib3_context()
        context.load_cert_chain(certfile=self._certfile,
                                keyfile=self._keyfile,
                                password=str(self._password))
        kwargs['ssl_context'] = context


class ProjectRegistry:
    """
    Class implements functionality to interface with Project Registry
    """
    def __init__(self, api_server: str, cookie: str, cert: str, key: str, pass_phrase: str = None):
        self.api_server = api_server
        self.cookie = cookie
        self.cert = cert
        self.key = key
        self.pass_phrase = pass_phrase

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
                                       "Cookie: {} not available".format(self.api_server, self.cookie))

        url = self.api_server + "/people/oidc_claim_sub?oidc_claim_sub={}".format(sub)
        session = requests.Session()
        session.mount('https://', SSLAdapter(self.cert, self.key, self.pass_phrase))
        temp = self.cookie.split('=')
        cookie_dict = {temp[0]: temp[1]}

        response = session.get(url, headers=self._headers(), cookies=cookie_dict, verify=False)

        if response.status_code != 200:
            raise ProjectRegistryError("Project Registry error occurred "
                                       "status_code: {} message: {}".format(response.status_code, response.content))

        return response.json()['roles']


class ProjectRegistryError(Exception):
    """
    Project Registry Exception
    """
    pass
