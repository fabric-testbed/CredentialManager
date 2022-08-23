# coding: utf-8

from __future__ import absolute_import
from datetime import date, datetime  # noqa: F401

from typing import List, Dict  # noqa: F401

from fabric_cm.credmgr.swagger_server.models.base_model_ import Model
from fabric_cm.credmgr.swagger_server import util


class Status401UnauthorizedErrors(Model):
    """NOTE: This class is auto generated by the swagger code generator program.

    Do not edit the class manually.
    """
    def __init__(self, message: str='Unauthorized', details: str=None):  # noqa: E501
        """Status401UnauthorizedErrors - a model defined in Swagger

        :param message: The message of this Status401UnauthorizedErrors.  # noqa: E501
        :type message: str
        :param details: The details of this Status401UnauthorizedErrors.  # noqa: E501
        :type details: str
        """
        self.swagger_types = {
            'message': str,
            'details': str
        }

        self.attribute_map = {
            'message': 'message',
            'details': 'details'
        }
        self._message = message
        self._details = details

    @classmethod
    def from_dict(cls, dikt) -> 'Status401UnauthorizedErrors':
        """Returns the dict as a model

        :param dikt: A dict.
        :type: dict
        :return: The status_401_unauthorized_errors of this Status401UnauthorizedErrors.  # noqa: E501
        :rtype: Status401UnauthorizedErrors
        """
        return util.deserialize_model(dikt, cls)

    @property
    def message(self) -> str:
        """Gets the message of this Status401UnauthorizedErrors.


        :return: The message of this Status401UnauthorizedErrors.
        :rtype: str
        """
        return self._message

    @message.setter
    def message(self, message: str):
        """Sets the message of this Status401UnauthorizedErrors.


        :param message: The message of this Status401UnauthorizedErrors.
        :type message: str
        """

        self._message = message

    @property
    def details(self) -> str:
        """Gets the details of this Status401UnauthorizedErrors.


        :return: The details of this Status401UnauthorizedErrors.
        :rtype: str
        """
        return self._details

    @details.setter
    def details(self, details: str):
        """Sets the details of this Status401UnauthorizedErrors.


        :param details: The details of this Status401UnauthorizedErrors.
        :type details: str
        """

        self._details = details