# coding: utf-8

from __future__ import absolute_import

from fabric.credmgr.swagger_server.models.base_model_ import Model
from fabric.credmgr.swagger_server import util


class CredMgrResponseValue(Model):
    """NOTE: This class is auto generated by the swagger code generator program.

    Do not edit the class manually.
    """
    def __init__(self, authorization_url: str=None, user_id: str=None, id_token: str=None, refresh_token: str=None):  # noqa: E501
        """CredMgrResponseValue - a model defined in Swagger

        :param authorization_url: The authorization_url of this CredMgrResponseValue.  # noqa: E501
        :type authorization_url: str
        :param user_id: The user_id of this CredMgrResponseValue.  # noqa: E501
        :type user_id: str
        :param id_token: The id_token of this CredMgrResponseValue.  # noqa: E501
        :type id_token: str
        :param refresh_token: The refresh_token of this CredMgrResponseValue.  # noqa: E501
        :type refresh_token: str
        """
        self.swagger_types = {
            'authorization_url': str,
            'user_id': str,
            'id_token': str,
            'refresh_token': str
        }

        self.attribute_map = {
            'authorization_url': 'authorization_url',
            'user_id': 'user_id',
            'id_token': 'id_token',
            'refresh_token': 'refresh_token'
        }
        self._authorization_url = authorization_url
        self._user_id = user_id
        self._id_token = id_token
        self._refresh_token = refresh_token

    @classmethod
    def from_dict(cls, dikt) -> 'CredMgrResponseValue':
        """Returns the dict as a model

        :param dikt: A dict.
        :type: dict
        :return: The credMgrResponse_value of this CredMgrResponseValue.  # noqa: E501
        :rtype: CredMgrResponseValue
        """
        return util.deserialize_model(dikt, cls)

    @property
    def authorization_url(self) -> str:
        """Gets the authorization_url of this CredMgrResponseValue.

        Authorization Url user must visit to authenticate  # noqa: E501

        :return: The authorization_url of this CredMgrResponseValue.
        :rtype: str
        """
        return self._authorization_url

    @authorization_url.setter
    def authorization_url(self, authorization_url: str):
        """Sets the authorization_url of this CredMgrResponseValue.

        Authorization Url user must visit to authenticate  # noqa: E501

        :param authorization_url: The authorization_url of this CredMgrResponseValue.
        :type authorization_url: str
        """

        self._authorization_url = authorization_url

    @property
    def user_id(self) -> str:
        """Gets the user_id of this CredMgrResponseValue.

        Unique id to identify the user to which token was issued  # noqa: E501

        :return: The user_id of this CredMgrResponseValue.
        :rtype: str
        """
        return self._user_id

    @user_id.setter
    def user_id(self, user_id: str):
        """Sets the user_id of this CredMgrResponseValue.

        Unique id to identify the user to which token was issued  # noqa: E501

        :param user_id: The user_id of this CredMgrResponseValue.
        :type user_id: str
        """

        self._user_id = user_id

    @property
    def id_token(self) -> str:
        """Gets the id_token of this CredMgrResponseValue.

        Identity Token  # noqa: E501

        :return: The id_token of this CredMgrResponseValue.
        :rtype: str
        """
        return self._id_token

    @id_token.setter
    def id_token(self, id_token: str):
        """Sets the id_token of this CredMgrResponseValue.

        Identity Token  # noqa: E501

        :param id_token: The id_token of this CredMgrResponseValue.
        :type id_token: str
        """

        self._id_token = id_token

    @property
    def refresh_token(self) -> str:
        """Gets the refresh_token of this CredMgrResponseValue.

        Refresh Token  # noqa: E501

        :return: The refresh_token of this CredMgrResponseValue.
        :rtype: str
        """
        return self._refresh_token

    @refresh_token.setter
    def refresh_token(self, refresh_token: str):
        """Sets the refresh_token of this CredMgrResponseValue.

        Refresh Token  # noqa: E501

        :param refresh_token: The refresh_token of this CredMgrResponseValue.
        :type refresh_token: str
        """

        self._refresh_token = refresh_token