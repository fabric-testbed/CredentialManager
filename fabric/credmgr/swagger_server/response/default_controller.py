import connexion
import requests
import six

from fabric.credmgr.swagger_server.models.version import Version  # noqa: E501
from fabric.credmgr.swagger_server import util, received_counter, success_counter, failure_counter
from fabric.credmgr.utils import LOG


def version_get():  # noqa: E501
    """version

    Version # noqa: E501


    :rtype: Version
    """
    received_counter.labels('get', '/version').inc()
    try:
        version = '1.0.0'
        tag = '1.0.0'
        url = "https://api.github.com/repos/fabric-testbesd/CredentialManager/git/refs/tags/{}".format(tag)

        response = Version()
        response.version = version
        response.gitsha1 = 'Not Available'
    
        result = requests.get(url)
        if result.status_code == 200:
            if result.json() is not None:
                object_json = result.json().get("object", None)
                if object_json is not None:
                    sha = object_json.get("sha", None)
                    if sha is not None:
                        response.gitsha1 = sha
        success_counter.labels('get', '/version').inc()
    except Exception as e:
        LOG.exception(e)
        failure_counter.labels('get', '/version').inc()
        return str(e), 500
    return response
