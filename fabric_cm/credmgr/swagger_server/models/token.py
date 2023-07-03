# coding: utf-8

from __future__ import absolute_import
from datetime import date, datetime  # noqa: F401

from typing import List, Dict  # noqa: F401

from fabric_cm.credmgr.swagger_server.models.base_model_ import Model
from fabric_cm.credmgr.swagger_server import util


class Token(Model):
    """NOTE: This class is auto generated by the swagger code generator program.

    Do not edit the class manually.
    """
    def __init__(self, token_hash: str=None, created_at: str=None, expires_at: str=None, state: str=None, created_from: str=None, comment: str=None, id_token: str=None, refresh_token: str=None):  # noqa: E501
        """Token - a model defined in Swagger

        :param token_hash: The token_hash of this Token.  # noqa: E501
        :type token_hash: str
        :param created_at: The created_at of this Token.  # noqa: E501
        :type created_at: str
        :param expires_at: The expires_at of this Token.  # noqa: E501
        :type expires_at: str
        :param state: The state of this Token.  # noqa: E501
        :type state: str
        :param created_from: The created_from of this Token.  # noqa: E501
        :type created_from: str
        :param comment: The comment of this Token.  # noqa: E501
        :type comment: str
        :param id_token: The id_token of this Token.  # noqa: E501
        :type id_token: str
        :param refresh_token: The refresh_token of this Token.  # noqa: E501
        :type refresh_token: str
        """
        self.swagger_types = {
            'token_hash': str,
            'created_at': str,
            'expires_at': str,
            'state': str,
            'created_from': str,
            'comment': str,
            'id_token': str,
            'refresh_token': str
        }

        self.attribute_map = {
            'token_hash': 'token_hash',
            'created_at': 'created_at',
            'expires_at': 'expires_at',
            'state': 'state',
            'created_from': 'created_from',
            'comment': 'comment',
            'id_token': 'id_token',
            'refresh_token': 'refresh_token'
        }
        self._token_hash = token_hash
        self._created_at = created_at
        self._expires_at = expires_at
        self._state = state
        self._created_from = created_from
        self._comment = comment
        self._id_token = id_token
        self._refresh_token = refresh_token

    @classmethod
    def from_dict(cls, dikt) -> 'Token':
        """Returns the dict as a model

        :param dikt: A dict.
        :type: dict
        :return: The token of this Token.  # noqa: E501
        :rtype: Token
        """
        return util.deserialize_model(dikt, cls)

    @property
    def token_hash(self) -> str:
        """Gets the token_hash of this Token.

        Identity Token SHA256 Hash  # noqa: E501

        :return: The token_hash of this Token.
        :rtype: str
        """
        return self._token_hash

    @token_hash.setter
    def token_hash(self, token_hash: str):
        """Sets the token_hash of this Token.

        Identity Token SHA256 Hash  # noqa: E501

        :param token_hash: The token_hash of this Token.
        :type token_hash: str
        """
        if token_hash is None:
            raise ValueError("Invalid value for `token_hash`, must not be `None`")  # noqa: E501

        self._token_hash = token_hash

    @property
    def created_at(self) -> str:
        """Gets the created_at of this Token.

        Token creation time  # noqa: E501

        :return: The created_at of this Token.
        :rtype: str
        """
        return self._created_at

    @created_at.setter
    def created_at(self, created_at: str):
        """Sets the created_at of this Token.

        Token creation time  # noqa: E501

        :param created_at: The created_at of this Token.
        :type created_at: str
        """
        if created_at is None:
            raise ValueError("Invalid value for `created_at`, must not be `None`")  # noqa: E501

        self._created_at = created_at

    @property
    def expires_at(self) -> str:
        """Gets the expires_at of this Token.

        Token expiry time  # noqa: E501

        :return: The expires_at of this Token.
        :rtype: str
        """
        return self._expires_at

    @expires_at.setter
    def expires_at(self, expires_at: str):
        """Sets the expires_at of this Token.

        Token expiry time  # noqa: E501

        :param expires_at: The expires_at of this Token.
        :type expires_at: str
        """
        if expires_at is None:
            raise ValueError("Invalid value for `expires_at`, must not be `None`")  # noqa: E501

        self._expires_at = expires_at

    @property
    def state(self) -> str:
        """Gets the state of this Token.

        Token state  # noqa: E501

        :return: The state of this Token.
        :rtype: str
        """
        return self._state

    @state.setter
    def state(self, state: str):
        """Sets the state of this Token.

        Token state  # noqa: E501

        :param state: The state of this Token.
        :type state: str
        """
        allowed_values = ["Nascent", "Valid", "Refreshed", "Revoked", "Expired"]  # noqa: E501
        if state not in allowed_values:
            raise ValueError(
                "Invalid value for `state` ({0}), must be one of {1}"
                .format(state, allowed_values)
            )

        self._state = state

    @property
    def created_from(self) -> str:
        """Gets the created_from of this Token.

        Remote IP from where the token create request was received  # noqa: E501

        :return: The created_from of this Token.
        :rtype: str
        """
        return self._created_from

    @created_from.setter
    def created_from(self, created_from: str):
        """Sets the created_from of this Token.

        Remote IP from where the token create request was received  # noqa: E501

        :param created_from: The created_from of this Token.
        :type created_from: str
        """
        if created_from is None:
            raise ValueError("Invalid value for `created_from`, must not be `None`")  # noqa: E501

        self._created_from = created_from

    @property
    def comment(self) -> str:
        """Gets the comment of this Token.

        Comment provided at creation  # noqa: E501

        :return: The comment of this Token.
        :rtype: str
        """
        return self._comment

    @comment.setter
    def comment(self, comment: str):
        """Sets the comment of this Token.

        Comment provided at creation  # noqa: E501

        :param comment: The comment of this Token.
        :type comment: str
        """

        self._comment = comment

    @property
    def id_token(self) -> str:
        """Gets the id_token of this Token.

        Identity Token  # noqa: E501

        :return: The id_token of this Token.
        :rtype: str
        """
        return self._id_token

    @id_token.setter
    def id_token(self, id_token: str):
        """Sets the id_token of this Token.

        Identity Token  # noqa: E501

        :param id_token: The id_token of this Token.
        :type id_token: str
        """

        self._id_token = id_token

    @property
    def refresh_token(self) -> str:
        """Gets the refresh_token of this Token.

        Refresh Token  # noqa: E501

        :return: The refresh_token of this Token.
        :rtype: str
        """
        return self._refresh_token

    @refresh_token.setter
    def refresh_token(self, refresh_token: str):
        """Sets the refresh_token of this Token.

        Refresh Token  # noqa: E501

        :param refresh_token: The refresh_token of this Token.
        :type refresh_token: str
        """

        self._refresh_token = refresh_token
