import connexion
import six

from fabric.credmgr.swagger_server.models.version import Version  # noqa: E501
from fabric.credmgr.swagger_server import util
from fabric.credmgr.swagger_server.response import default_controller as rc


def version_get():  # noqa: E501
    """version

    Version # noqa: E501


    :rtype: Version
    """
    return rc.version_get()
