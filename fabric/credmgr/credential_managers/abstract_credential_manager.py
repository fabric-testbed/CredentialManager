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
Base class for Credential Manager
"""
from abc import ABCMeta, abstractmethod
import six


@six.add_metaclass(ABCMeta)
class AbstractCredentialManager:
    """
    Abstract Credential Manager class
    """
    @abstractmethod
    def create_token(self, project: str, scope: str, ci_logon_id_token: str,
                     refresh_token: str, cookie: str = None) -> dict:
        """
        Generates key file and return authorization url for user to authenticate itself and also returns user id

        @param project: Project for which token is requested, by default it is set to 'all'
        @param scope: Scope of the requested token, by default it is set to 'all'
        @param ci_logon_id_token: CI logon Identity Token
        @param refresh_token: Refresh Token
        @param cookie: Vouch Proxy Cookie

        @returns dict containing id_token and refresh_token
        @raises Exception in case of error
        """

    @abstractmethod
    def refresh_token(self, refresh_token: str, project: str, scope: str, cookie: str = None) -> dict:
        """
        Refreshes a token from CILogon and generates Fabric token using project and scope saved in Database

        @param project: Project for which token is requested, by default it is set to 'all'
        @param scope: Scope of the requested token, by default it is set to 'all'
        @param refresh_token: Refresh Token
        @param cookie: Vouch Proxy Cookie
        @returns dict containing id_token and refresh_token

        @raises Exception in case of error
        """

    @abstractmethod
    def revoke_token(self, refresh_token: str):
        """
        Revoke a refresh token

        @returns dictionary containing status of the operation
        @raises Exception in case of error
        """
