import connexion

from fabric_cm.credmgr.swagger_server.models.request import Request  # noqa: E501
from fabric_cm.credmgr.swagger_server.models.status200_ok_no_content import Status200OkNoContent  # noqa: E501
from fabric_cm.credmgr.swagger_server.models.tokens import Tokens  # noqa: E501
from fabric_cm.credmgr.swagger_server.response import tokens_controller as rc


def tokens_create_post(project_id=None, scope=None):  # noqa: E501
    """Generate tokens for an user

    Request to generate tokens for an user  # noqa: E501

    :param project_id: Project identified by universally unique identifier
    :type project_id: str
    :param scope: Scope for which token is requested
    :type scope: str

    :rtype: Tokens
    """
    return rc.tokens_create_post(project_id, scope)


def tokens_refresh_post(body, project_id=None, scope=None):  # noqa: E501
    """Refresh tokens for an user

    Request to refresh OAuth tokens for an user  # noqa: E501

    :param body: 
    :type body: dict | bytes
    :param project_id: Project identified by universally unique identifier
    :type project_id: str
    :param scope: Scope for which token is requested
    :type scope: str

    :rtype: Tokens
    """
    if connexion.request.is_json:
        body = Request.from_dict(connexion.request.get_json())  # noqa: E501
    return rc.tokens_refresh_post(body, project_id, scope)


def tokens_revoke_post(body):  # noqa: E501
    """Revoke a refresh token for an user

    Request to revoke a refresh token for an user  # noqa: E501

    :param body: 
    :type body: dict | bytes

    :rtype: Status200OkNoContent
    """
    if connexion.request.is_json:
        body = Request.from_dict(connexion.request.get_json())  # noqa: E501
    return rc.tokens_revoke_post(body)
