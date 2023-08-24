import connexion

from fabric_cm.credmgr.swagger_server.models.request import Request  # noqa: E501
from fabric_cm.credmgr.swagger_server.models.status200_ok_no_content import Status200OkNoContent  # noqa: E501
from fabric_cm.credmgr.swagger_server.models.token_post import TokenPost
from fabric_cm.credmgr.swagger_server.models.tokens import Tokens  # noqa: E501
from fabric_cm.credmgr.swagger_server.models.revoke_list import RevokeList  # noqa: E501
from fabric_cm.credmgr.swagger_server.response import tokens_controller as rc


def tokens_create_post(project_id=None, project_name=None, scope=None, lifetime=4, comment=None):  # noqa: E501
    """Generate tokens for an user

    Request to generate tokens for an user  # noqa: E501

    :param project_id: Project identified by universally unique identifier
    :type project_id: str
    :param project_name: Project identified by name
    :type project_name: str
    :param scope: Scope for which token is requested
    :type scope: str
    :param lifetime: Lifetime of the token requested in hours
    :type lifetime: int
    :param comment: Comment
    :type comment: str

    :rtype: Tokens
    """
    return rc.tokens_create_post(project_id, project_name, scope, lifetime, comment)


def tokens_delete_delete():  # noqa: E501
    """Delete all tokens for a user

    Request to delete all tokens for a user  # noqa: E501


    :rtype: Status200OkNoContent
    """
    return rc.tokens_delete_delete()


def tokens_delete_token_hash_delete(token_hash):  # noqa: E501
    """Delete a token for an user

    Request to delete a token for an user  # noqa: E501

    :param token_hash: Token identified by SHA256 Hash
    :type token_hash: str

    :rtype: Status200OkNoContent
    """
    return rc.tokens_delete_token_hash_delete(token_hash=token_hash)


def tokens_get(token_hash=None, project_id=None, expires=None, states=None, limit=None, offset=None):  # noqa: E501
    """Get tokens

    Get tokens for a user in a project  # noqa: E501

    :param token_hash: Token identified by SHA256 hash
    :type token_hash: str
    :param project_id: Project identified by universally unique identifier
    :type project_id: str
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
    return rc.tokens_get(token_hash=token_hash, project_id=project_id, expires=expires, states=states,
                         limit=limit, offset=offset)


def tokens_refresh_post(body, project_id=None, project_name=None, scope=None):  # noqa: E501
    """Refresh tokens for an user

    Request to refresh OAuth tokens for an user  # noqa: E501

    :param body: 
    :type body: dict | bytes
    :param project_id: Project identified by universally unique identifier
    :type project_id: str
    :param project_name: Project identified by name
    :type project_name: str
    :param scope: Scope for which token is requested
    :type scope: str

    :rtype: Tokens
    """
    if connexion.request.is_json:
        body = Request.from_dict(connexion.request.get_json())  # noqa: E501
    return rc.tokens_refresh_post(body, project_id, project_name, scope)


def tokens_revoke_list_get(project_id=None):  # noqa: E501
    """Get token revoke list i.e. list of revoked identity token hashes

    Get token revoke list i.e. list of revoked identity token hashes for a user in a project  # noqa: E501

    :param project_id: Project identified by universally unique identifier
    :type project_id: str

    :rtype: RevokeList
    """
    return rc.tokens_revoke_list_get(project_id)


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


def tokens_validate_post(body):  # noqa: E501
    """Validate an identity token issued by Credential Manager

    Validate an identity token issued by Credential Manager  # noqa: E501

    :param body: 
    :type body: dict | bytes

    :rtype: DecodedToken
    """
    if connexion.request.is_json:
        body = TokenPost.from_dict(connexion.request.get_json())  # noqa: E501
    return rc.tokens_validate_post(body)

