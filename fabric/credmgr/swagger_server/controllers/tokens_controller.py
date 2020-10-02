import connexion
import six

from fabric.credmgr.swagger_server.models.request import Request  # noqa: E501
from fabric.credmgr.swagger_server.models.success import Success  # noqa: E501
from fabric.credmgr.swagger_server import util
from fabric.credmgr.swagger_server.response import tokens_controller as rc


def tokens_create_post(project_name=None, scope=None):  # noqa: E501
    """Generate tokens for an user

    Request to generate tokens for an user  # noqa: E501

    :param project_name: Project Name
    :type project_name: str
    :param scope: Scope for which token is requested
    :type scope: str

    :rtype: Success
    """
    return rc.tokens_create_post(project_name, scope)


def tokens_refresh_post(body=None, project_name=None, scope=None):  # noqa: E501
    """Refresh tokens for an user

    Request to refresh OAuth tokens for an user  # noqa: E501

    :param body: 
    :type body: dict | bytes
    :param project_name: Project Name
    :type project_name: str
    :param scope: Scope for which token is requested
    :type scope: str

    :rtype: Success
    """
    if connexion.request.is_json:
        body = Request.from_dict(connexion.request.get_json())  # noqa: E501
    return rc.tokens_refresh_post(body, project_name, scope)


def tokens_revoke_post(body=None):  # noqa: E501
    """Revoke a refresh token for an user

    Request to revoke a refresh token for an user  # noqa: E501

    :param body: 
    :type body: dict | bytes

    :rtype: None
    """
    if connexion.request.is_json:
        body = Request.from_dict(connexion.request.get_json())  # noqa: E501
    return rc.tokens_revoke_post(body)
