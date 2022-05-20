from fabric_cm.credmgr.swagger_server.models.jwks import Jwks  # noqa: E501
from fabric_cm.credmgr.swagger_server.response import default_controller as rc


def certs_get():  # noqa: E501
    """Return Public Keys to verify signature of the tokens

    Json Web Keys # noqa: E501


    :rtype: Jwks
    """
    return rc.certs_get()
