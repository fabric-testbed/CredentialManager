from fabric_cm.credmgr.swagger_server import received_counter, success_counter, failure_counter
from fabric_cm.credmgr.swagger_server.models.version import Version
from fabric_cm.credmgr.swagger_server.models.version_data import VersionData
from fabric_cm import __VERSION__, __API_REFERENCE__
from fabric_cm.credmgr.swagger_server.response.constants import HTTP_METHOD_GET, VERSION_URL
from fabric_cm.credmgr.swagger_server.response.cors_response import cors_500, cors_200


def version_get() -> Version:  # noqa: E501
    """version
    Version # noqa: E501
    :rtype: Version
    """
    try:
        received_counter.labels(HTTP_METHOD_GET, VERSION_URL).inc()
        version = VersionData()
        version.reference = __API_REFERENCE__
        version.version = __VERSION__
        response = Version()
        response.data = [version]
        response.size = len(response.data)
        response.status = 200
        response.type = 'version'
        success_counter.labels(HTTP_METHOD_GET, VERSION_URL).inc()
        return cors_200(response_body=response)
    except Exception as exc:
        details = 'Oops! something went wrong with version_get(): {0}'.format(exc)
        failure_counter.labels(HTTP_METHOD_GET, VERSION_URL).inc()
        return cors_500(details=details)