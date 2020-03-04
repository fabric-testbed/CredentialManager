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
import sys
import os
from abc import ABCMeta, abstractmethod
from credmgr.utils import get_cred_dir
from credmgr import LOGGER
import logging

@six.add_metaclass(ABCMeta)
class AbstractCredentialManager:
    """
    Abstract Credential Monitor class

    :param cred_dir: The credential directory to scan.
    :type cred_dir: str
    """

    def __init__(self, cred_dir = None):
        self.cred_dir = get_cred_dir(cred_dir)
        self.log = self.get_logger()

    def get_logger(self):
        """Returns a child logger object specific to its class"""
        logger = logging.getLogger(LOGGER + '.' + self.__class__.__name__)
        return logger

    @abstractmethod
    def should_renew(self):
        raise NotImplementedError

    @abstractmethod
    def refresh_access_token(self):
        raise NotImplementedError

    @abstractmethod
    def check_access_token(self):
        raise NotImplementedError

    @abstractmethod
    def scan_tokens(self):
        raise NotImplementedError
