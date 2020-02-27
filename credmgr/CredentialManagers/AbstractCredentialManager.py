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
