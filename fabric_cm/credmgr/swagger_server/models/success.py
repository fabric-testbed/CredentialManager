# coding: utf-8

from __future__ import absolute_import
from datetime import date, datetime  # noqa: F401

from typing import List, Dict  # noqa: F401

from fabric_cm.credmgr.swagger_server.models.base_model_ import Model
from fabric_cm.credmgr.swagger_server import util


class Success(Model):
    """NOTE: This class is auto generated by the swagger code generator program.

    Do not edit the class manually.
    """
    def __init__(self, id_token: str=None, refresh_token: str=None):  # noqa: E501
        """Success - a model defined in Swagger

        :param id_token: The id_token of this Success.  # noqa: E501
        :type id_token: str
        :param refresh_token: The refresh_token of this Success.  # noqa: E501
        :type refresh_token: str
        """
        self.swagger_types = {
            'id_token': str,
            'refresh_token': str
        }

        self.attribute_map = {
            'id_token': 'id_token',
            'refresh_token': 'refresh_token'
        }
        self._id_token = id_token
        self._refresh_token = refresh_token

    @classmethod
    def from_dict(cls, dikt) -> 'Success':
        """Returns the dict as a model

        :param dikt: A dict.
        :type: dict
        :return: The success of this Success.  # noqa: E501
        :rtype: Success
        """
        return util.deserialize_model(dikt, cls)

    @property
    def id_token(self) -> str:
        """Gets the id_token of this Success.

        Identity Token  # noqa: E501

        :return: The id_token of this Success.
        :rtype: str
        """
        return self._id_token

    @id_token.setter
    def id_token(self, id_token: str):
        """Sets the id_token of this Success.

        Identity Token  # noqa: E501

        :param id_token: The id_token of this Success.
        :type id_token: str
        """

        self._id_token = id_token

    @property
    def refresh_token(self) -> str:
        """Gets the refresh_token of this Success.

        Refresh Token  # noqa: E501

        :return: The refresh_token of this Success.
        :rtype: str
        """
        return self._refresh_token

    @refresh_token.setter
    def refresh_token(self, refresh_token: str):
        """Sets the refresh_token of this Success.

        Refresh Token  # noqa: E501

        :param refresh_token: The refresh_token of this Success.
        :type refresh_token: str
        """

        self._refresh_token = refresh_token