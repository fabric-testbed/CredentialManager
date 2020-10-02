import connexion
import six

from fabric.credmgr.credential_managers.oauth_credmgr import OAuthCredmgr
from fabric.credmgr.swagger_server.models.request import Request  # noqa: E501
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
    try:
        ci_logon_id_token = connexion.request.headers.get('X-Vouch-Idp-Idtoken', None)
        refresh_token = connexion.request.headers.get('X-Vouch-Idp-Refreshtoken', None)
        cookie = connexion.request.headers.get('Cookie', None)
        credmgr = OAuthCredmgr()
        result = credmgr.create_token(ci_logon_id_token=ci_logon_id_token,
                                      refresh_token=refresh_token,
                                      project=project_name,
                                      scope=scope,
                                      cookie=cookie)
        response = Success.from_dict(result)
        LOG.debug(result)
        success_counter.labels('post', '/tokens/create').inc()
        return response
    except Exception as e:
        LOG.exception(e)
        failure_counter.labels('post', '/tokens/create').inc()
        return str(e), 500


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
        body = Request.from_dict(connexion.request.get_json())  # noqa: E501
    try:
        cookie = connexion.request.headers.get('Cookie', None)
        credmgr = OAuthCredmgr()
        response = Success.from_dict(credmgr.refresh_token(refresh_token=body.refresh_token,
                                                                      project=project_name, scope=scope,
                                                                      cookie=cookie))
        success_counter.labels('post', '/tokens/refresh').inc()
        return response
    except Exception as e:
        LOG.exception(e)
        failure_counter.labels('post', '/tokens/refresh').inc()
        return str(e), 500


def tokens_revoke_post(body):  # noqa: E501
    """Revoke a refresh token for an user

    Request to revoke a refresh token for an user  # noqa: E501

    :param body: 
    :type body: dict | bytes

    :rtype: Success
    """
    received_counter.labels('post', '/tokens/revoke').inc()
    if connexion.request.is_json:
        body = Request.from_dict(connexion.request.get_json())  # noqa: E501
    try:
        credmgr = OAuthCredmgr()
        credmgr.revoke_token(refresh_token=body.refresh_token)
        success_counter.labels('post', '/tokens/revoke').inc()
    except Exception as e:
        LOG.exception(e)
        failure_counter.labels('post', '/tokens/revoke').inc()
        return str(e), 500
    return {}