# coding: utf-8

from __future__ import absolute_import
from datetime import date, datetime  # noqa: F401

from typing import List, Dict  # noqa: F401

from fabric_cm.credmgr.swagger_server.models.base_model_ import Model
from fabric_cm.credmgr.swagger_server import util


class Status200OkPaginated(Model):
    """NOTE: This class is auto generated by the swagger code generator program.

    Do not edit the class manually.
    """
    def __init__(self, limit: int=None, offset: int=None, size: int=None, status: int=200, type: str=None):  # noqa: E501
        """Status200OkPaginated - a model defined in Swagger

        :param limit: The limit of this Status200OkPaginated.  # noqa: E501
        :type limit: int
        :param offset: The offset of this Status200OkPaginated.  # noqa: E501
        :type offset: int
        :param size: The size of this Status200OkPaginated.  # noqa: E501
        :type size: int
        :param status: The status of this Status200OkPaginated.  # noqa: E501
        :type status: int
        :param type: The type of this Status200OkPaginated.  # noqa: E501
        :type type: str
        """
        self.swagger_types = {
            'limit': int,
            'offset': int,
            'size': int,
            'status': int,
            'type': str
        }

        self.attribute_map = {
            'limit': 'limit',
            'offset': 'offset',
            'size': 'size',
            'status': 'status',
            'type': 'type'
        }
        self._limit = limit
        self._offset = offset
        self._size = size
        self._status = status
        self._type = type

    @classmethod
    def from_dict(cls, dikt) -> 'Status200OkPaginated':
        """Returns the dict as a model

        :param dikt: A dict.
        :type: dict
        :return: The status_200_ok_paginated of this Status200OkPaginated.  # noqa: E501
        :rtype: Status200OkPaginated
        """
        return util.deserialize_model(dikt, cls)

    @property
    def limit(self) -> int:
        """Gets the limit of this Status200OkPaginated.


        :return: The limit of this Status200OkPaginated.
        :rtype: int
        """
        return self._limit

    @limit.setter
    def limit(self, limit: int):
        """Sets the limit of this Status200OkPaginated.


        :param limit: The limit of this Status200OkPaginated.
        :type limit: int
        """

        self._limit = limit

    @property
    def offset(self) -> int:
        """Gets the offset of this Status200OkPaginated.


        :return: The offset of this Status200OkPaginated.
        :rtype: int
        """
        return self._offset

    @offset.setter
    def offset(self, offset: int):
        """Sets the offset of this Status200OkPaginated.


        :param offset: The offset of this Status200OkPaginated.
        :type offset: int
        """

        self._offset = offset

    @property
    def size(self) -> int:
        """Gets the size of this Status200OkPaginated.


        :return: The size of this Status200OkPaginated.
        :rtype: int
        """
        return self._size

    @size.setter
    def size(self, size: int):
        """Sets the size of this Status200OkPaginated.


        :param size: The size of this Status200OkPaginated.
        :type size: int
        """

        self._size = size

    @property
    def status(self) -> int:
        """Gets the status of this Status200OkPaginated.


        :return: The status of this Status200OkPaginated.
        :rtype: int
        """
        return self._status

    @status.setter
    def status(self, status: int):
        """Sets the status of this Status200OkPaginated.


        :param status: The status of this Status200OkPaginated.
        :type status: int
        """

        self._status = status

    @property
    def type(self) -> str:
        """Gets the type of this Status200OkPaginated.


        :return: The type of this Status200OkPaginated.
        :rtype: str
        """
        return self._type

    @type.setter
    def type(self, type: str):
        """Sets the type of this Status200OkPaginated.


        :param type: The type of this Status200OkPaginated.
        :type type: str
        """

        self._type = type
