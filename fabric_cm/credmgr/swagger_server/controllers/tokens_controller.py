import connexion

from fabric_cm.credmgr.swagger_server.models.request import Request  # noqa: E501
from fabric_cm.credmgr.swagger_server.models.status200_ok_no_content import Status200OkNoContent  # noqa: E501
from fabric_cm.credmgr.swagger_server.models.token_post import TokenPost
from fabric_cm.credmgr.swagger_server.models.tokens import Tokens  # noqa: E501
from fabric_cm.credmgr.swagger_server.models.revoke_list import RevokeList  # noqa: E501
from fabric_cm.credmgr.swagger_server.response import tokens_controller as rc


def tokens_create_post(project_id=None, scope=None, lifetime=None):  # noqa: E501
    """Generate tokens for an user

    Request to generate tokens for an user  # noqa: E501

    :param project_id: Project identified by universally unique identifier
    :type project_id: str
    :param scope: Scope for which token is requested
    :type scope: str
    :param lifetime: Lifetime of the token requested in hours
    :type lifetime: int

    :rtype: Tokens
    """
    return rc.tokens_create_post(project_id, scope, lifetime)


def tokens_get(token_hash=None, project_id=None, user_id=None, user_email=None, expires=None, states=None,
               limit=None, offset=None):  # noqa: E501
    """Get tokens

    :param token_hash: Token identified by SHA256 hash
    :type token_hash: str
    :param project_id: Project identified by universally unique identifier
    :type project_id: str
    :param user_id: User identified by universally unique identifier
    :type user_id: str
    :param user_email: User identified by email
    :type user_email: str
    :param expires: Search for tokens with expiry time lesser than the specified expiration time
    :type expires: str
    :param states: Search for Tokens in the specified states
    :type states: List[str]
    :param limit: maximum number of results to return per page (1 or more)
    :type limit: int
    :param offset: number of items to skip before starting to collect the result set
    :type offset: int

    :rtype: Tokens
    """
    return rc.tokens_get(token_hash=token_hash, project_id=project_id, user_id=user_id, user_email=user_email,
                         expires=expires, states=states, limit=limit, offset=offset)


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


def tokens_revoke_list_get(project_id, user_id):  # noqa: E501
    """Get token revoke list i.e. list of revoked identity token hashes

    Get token revoke list i.e. list of revoked identity token hashes for a user in a project  # noqa: E501

    :param project_id: Project identified by universally unique identifier
    :type project_id: str
    :param user_id: User identified by universally unique identifier
    :type user_id: str

    :rtype: RevokeList
    """
    return rc.tokens_revoke_list_get(project_id, user_id)


def tokens_revoke_post(body):  # noqa: E501
    """Revoke a token for an user

    Request to revoke a token for an user  # noqa: E501

    :param body: 
    :type body: dict | bytes

    :rtype: Status200OkNoContent
    """
    if connexion.request.is_json:
        body = Request.from_dict(connexion.request.get_json())  # noqa: E501
    return rc.tokens_revoke_post(body)


def tokens_revokes_post(body):  # noqa: E501
    """Revoke a token

    Request to revoke a token  # noqa: E501

    :param body: 
    :type body: dict | bytes

    :rtype: Status200OkNoContent
    """
    if connexion.request.is_json:
        body = TokenPost.from_dict(connexion.request.get_json())  # noqa: E501
    return rc.tokens_revokes_post(body)
