import connexion
import six

from fabric_cm.credmgr.swagger_server.models.jwks import Jwks  # noqa: E501
from fabric_cm.credmgr.swagger_server.models.version import Version  # noqa: E501
from fabric_cm.credmgr.swagger_server import util
from fabric_cm.credmgr.swagger_server.response import default_controller as rc


def certs_get():  # noqa: E501
    """Return Public Keys to verify signature of the tokens

    Json Web Keys # noqa: E501


    :rtype: Jwks
    """
    return rc.certs_get()


def version_get():  # noqa: E501
    """version

    Version # noqa: E501


    :rtype: Version
    """
    return rc.version_get()
