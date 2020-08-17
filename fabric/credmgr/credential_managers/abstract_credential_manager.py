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
import six
from abc import ABCMeta, abstractmethod
from fabric.credmgr.utils.utils import get_cred_dir
from fabric.credmgr import LOGGER
import logging

@six.add_metaclass(ABCMeta)
class AbstractCredentialManager:
    """
    Abstract Credential Manager class

    :param cred_dir: The credential directory to scan.
    :type cred_dir: str
    """

    def __init__(self, cred_dir = None):
        self.cred_dir = get_cred_dir(cred_dir)
        self.log = self.get_logger()

    def get_logger(self):
        """
        Returns a child logger object specific to its class
        """
        logger = logging.getLogger(LOGGER + '.' + self.__class__.__name__)
        return logger

    @abstractmethod
    def scan_tokens(self):
        """
        Scan the Credential Directory to cleanup the old key files or delete the expired tokens from database
        """
        raise NotImplementedError

    @abstractmethod
    def create_token(self, project:str, scope:str) -> dict:
        """
        Generates key file and return authorization url for user to authenticate itself and also returns user id

        @param project: Project for which token is requested, by default it is set to 'all'
        @param scope: Scope of the requested token, by default it is set to 'all'

        @returns dictionary containing authorization_url and user_id
        @raises Exception in case of error
        """
        raise NotImplementedError

    @abstractmethod
    def refresh_token(self, user_id:str, refresh_token:dict) -> dict:
        """
        Refreshes a token from CILogon and generates Fabric token using project and scope saved in Database

        @returns dictionary containing tokens and user_id
        @raises Exception in case of error
        """
        raise NotImplementedError

    @abstractmethod
    def revoke_token(self, user_id:str, refresh_token:dict):
        """
        Revoke a refresh token

        @returns dictionary containing status of the operation
        @raises Exception in case of error
        """
        raise NotImplementedError

    @abstractmethod
    def get_token(self, user_id:str):
        """
        Returns the token for user_id returned via Create API after authentication

        @returns dictionary containing tokens and user_id
        @raises Exception in case of error
        """
        raise NotImplementedError
