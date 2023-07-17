# coding: utf-8

from __future__ import absolute_import
from datetime import date, datetime  # noqa: F401

from typing import List, Dict  # noqa: F401

from fabric_cm.credmgr.swagger_server.models.base_model_ import Model
from fabric_cm.credmgr.swagger_server.models.status200_ok_no_content import Status200OkNoContent  # noqa: F401,E501
from fabric_cm.credmgr.swagger_server.models.status200_ok_no_content_data import Status200OkNoContentData  # noqa: F401,E501
from fabric_cm.credmgr.swagger_server import util


class DecodedToken(Model):
    """NOTE: This class is auto generated by the swagger code generator program.

    Do not edit the class manually.
    """
    def __init__(self, data: List[Status200OkNoContentData]=None, type: str='no_content', size: int=1, status: int=200, token: object=None):  # noqa: E501
        """DecodedToken - a model defined in Swagger

        :param data: The data of this DecodedToken.  # noqa: E501
        :type data: List[Status200OkNoContentData]
        :param type: The type of this DecodedToken.  # noqa: E501
        :type type: str
        :param size: The size of this DecodedToken.  # noqa: E501
        :type size: int
        :param status: The status of this DecodedToken.  # noqa: E501
        :type status: int
        :param token: The token of this DecodedToken.  # noqa: E501
        :type token: object
        """
        self.swagger_types = {
            'data': List[Status200OkNoContentData],
            'type': str,
            'size': int,
            'status': int,
            'token': object
        }

        self.attribute_map = {
            'data': 'data',
            'type': 'type',
            'size': 'size',
            'status': 'status',
            'token': 'token'
        }
        self._data = data
        self._type = type
        self._size = size
        self._status = status
        self._token = token

    @classmethod
    def from_dict(cls, dikt) -> 'DecodedToken':
        """Returns the dict as a model

        :param dikt: A dict.
        :type: dict
        :return: The decoded_token of this DecodedToken.  # noqa: E501
        :rtype: DecodedToken
        """
        return util.deserialize_model(dikt, cls)

    @property
    def data(self) -> List[Status200OkNoContentData]:
        """Gets the data of this DecodedToken.


        :return: The data of this DecodedToken.
        :rtype: List[Status200OkNoContentData]
        """
        return self._data

    @data.setter
    def data(self, data: List[Status200OkNoContentData]):
        """Sets the data of this DecodedToken.


        :param data: The data of this DecodedToken.
        :type data: List[Status200OkNoContentData]
        """

        self._data = data

    @property
    def type(self) -> str:
        """Gets the type of this DecodedToken.


        :return: The type of this DecodedToken.
        :rtype: str
        """
        return self._type

    @type.setter
    def type(self, type: str):
        """Sets the type of this DecodedToken.


        :param type: The type of this DecodedToken.
        :type type: str
        """

        self._type = type

    @property
    def size(self) -> int:
        """Gets the size of this DecodedToken.


        :return: The size of this DecodedToken.
        :rtype: int
        """
        return self._size

    @size.setter
    def size(self, size: int):
        """Sets the size of this DecodedToken.


        :param size: The size of this DecodedToken.
        :type size: int
        """

        self._size = size

    @property
    def status(self) -> int:
        """Gets the status of this DecodedToken.


        :return: The status of this DecodedToken.
        :rtype: int
        """
        return self._status

    @status.setter
    def status(self, status: int):
        """Sets the status of this DecodedToken.


        :param status: The status of this DecodedToken.
        :type status: int
        """

        self._status = status

    @property
    def token(self) -> object:
        """Gets the token of this DecodedToken.


        :return: The token of this DecodedToken.
        :rtype: object
        """
        return self._token

    @token.setter
    def token(self, token: object):
        """Sets the token of this DecodedToken.


        :param token: The token of this DecodedToken.
        :type token: object
        """

        self._token = token