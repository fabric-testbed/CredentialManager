import logging

import connexion

from credmgr import LOGGER
from credmgr.CredentialManagers.OAuthCredmgrSingleton import OAuthCredmgrSingleton
from credmgr.swagger_server.models import CredMgrResponseValue
from credmgr.swagger_server.models.cred_mgr_response import CredMgrResponse
from credmgr.swagger_server.models.refresh_request import RefreshRequest  # noqa: E501


def create_post(user_name):  # noqa: E501
    """create tokens for an user

    Request to create tokens for an user  # noqa: E501

    :param user_name: 
    :type user_name: str

    :rtype: CredMgrResponse
    """
    logger = logging.getLogger(LOGGER)
    response = CredMgrResponse()
    try:
        response.message = OAuthCredmgrSingleton.get().create_token(user_name)
        response.status = 200
    except Exception as e:
        response.message = str(e)
        response.status = 500
        logger.exception(e)
    return response


def get_get(user_name):  # noqa: E501
    """get tokens for an user

    Request to get tokens for an user  # noqa: E501

    :param user_name: 
    :type user_name: str

    :rtype: CredMgrResponse
    """
    logger = logging.getLogger(LOGGER)
    response = CredMgrResponse()
    try:
        response.value = CredMgrResponseValue.from_dict(OAuthCredmgrSingleton.get().get_token(user_name))
        response.status = 200
    except Exception as e:
        logger.exception(e)
        response.message = str(e)
        response.status = 500
    return response


def refresh_post(body):  # noqa: E501
    """refresh tokens

    Request to get tokens for an user  # noqa: E501

    :param body: 
    :type body: dict | bytes

    :rtype: CredMgrResponse
    """
    if connexion.request.is_json:
        body = RefreshRequest.from_dict(connexion.request.get_json())  # noqa: E501
    logger = logging.getLogger(LOGGER)
    response = CredMgrResponse()
    try:
        response.value = CredMgrResponseValue.from_dict(OAuthCredmgrSingleton.get().refresh_token(body.refresh_token))
        response.status = 200
    except Exception as e:
        response.message = str(e)
        response.status = 500
        logger.exception(e)
    return response
