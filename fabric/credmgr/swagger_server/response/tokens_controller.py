import connexion
import six

from fabric.credmgr.credential_managers.oauth_credmgr_singleton import OAuthCredmgrSingleton
from fabric.credmgr.swagger_server.models import SuccessValue
from fabric.credmgr.swagger_server.models.refresh_revoke_request import RefreshRevokeRequest  # noqa: E501
from fabric.credmgr.swagger_server.models.success import Success  # noqa: E501
from fabric.credmgr.swagger_server import received_counter, success_counter, failure_counter
from fabric.credmgr.utils import LOG


def tokens_create_post(project_name=None, scope=None):  # noqa: E501
    """Generate Fabric OAuth tokens for an user

    Request to generate Fabric OAuth tokens for an user  # noqa: E501

    :param project_name: Project Name
    :type project_name: str
    :param scope: Scope for which token is requested
    :type scope: str

    :rtype: Success
    """
    received_counter.labels('post', '/tokens/create').inc()
    response = Success()
    try:
        result = OAuthCredmgrSingleton.get().create_token(project_name, scope)
        response.message = "Please visit {}! Use {} to retrieve the token after authentication".format(result["authorization_url"],
                                                                                                    result["user_id"])
        response.value = SuccessValue.from_dict(result)
        LOG.debug(result)
        response.status = 200
        success_counter.labels('post', '/tokens/create').inc()
    except Exception as e:
        response.message = str(e)
        response.status = 500
        LOG.exception(e)
        failure_counter.labels('post', '/tokens/create').inc()
    return response


def tokens_refresh_post(body, project_name=None, scope=None):  # noqa: E501
    """Refresh FABRIC OAuth tokens for an user

    Request to refresh OAuth tokens for an user  # noqa: E501

    :param body: 
    :type body: dict | bytes
    :param project_name: Project Name
    :type project_name: str
    :param scope: Scope for which token is requested
    :type scope: str

    :rtype: Success
    """
    received_counter.labels('post', '/tokens/refresh').inc()
    if connexion.request.is_json:
        body = RefreshRevokeRequest.from_dict(connexion.request.get_json())  # noqa: E501
    response = Success()
    try:
        response.value = SuccessValue.from_dict(OAuthCredmgrSingleton.get().refresh_token(body.refresh_token,
                                                                                                  project_name, scope))
        response.status = 200
        success_counter.labels('post', '/tokens/refresh').inc()
    except Exception as e:
        response.message = str(e)
        response.status = 500
        LOG.exception(e)
        failure_counter.labels('post', '/tokens/refresh').inc()
    return response


def tokens_revoke_post(body):  # noqa: E501
    """Revoke a refresh token for an user

    Request to revoke a refresh token for an user  # noqa: E501

    :param body: 
    :type body: dict | bytes

    :rtype: Success
    """
    received_counter.labels('post', '/tokens/revoke').inc()
    if connexion.request.is_json:
        body = RefreshRevokeRequest.from_dict(connexion.request.get_json())  # noqa: E501
    response = Success()
    try:
        OAuthCredmgrSingleton.get().revoke_token(body.refresh_token)
        response.message = "Token revoked successfully"
        response.status = 200
        success_counter.labels('post', '/tokens/revoke').inc()
    except Exception as e:
        response.message = str(e)
        response.status = 500
        LOG.exception(e)
        failure_counter.labels('post', '/tokens/revoke').inc()
    return response


def tokens_user_idget(user_id):  # noqa: E501
    """get tokens for an user

    Request to get tokens for an user  # noqa: E501

    :param user_id: User identifier returned in Create
    :type user_id: str

    :rtype: Success
    """
    received_counter.labels('get', '/tokens/{}'.format(user_id)).inc()
    response = Success()
    try:
        response.value = SuccessValue.from_dict(OAuthCredmgrSingleton.get().get_token(user_id))
        response.status = 200
        success_counter.labels('get', '/tokens/{}'.format(user_id)).inc()
    except Exception as e:
        LOG.exception(e)
        response.message = str(e)
        response.status = 500
        failure_counter.labels('get', '/tokens/{}'.format(user_id)).inc()
    return response
