#!/usr/bin/env python3
# MIT License
#
# Copyright (c) 2020 FABRIC Testbed
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.
#
# Author Komal Thareja (kthare10@renci.org)
"""
Module for handling version APIs
"""
import requests

from fabric_cm.credmgr.swagger_server.models.jwks import Jwks
from fabric_cm.credmgr.swagger_server.models.version import Version  # noqa: E501
from fabric_cm.credmgr.swagger_server import received_counter, success_counter, failure_counter, fabric_jwks
from fabric_cm.credmgr.swagger_server.response.constants import VERSION_URL, HTTP_METHOD_GET, CERTS_URL
from fabric_cm.credmgr.logging import LOG

def version_get():  # noqa: E501
    """version

    Version # noqa: E501


    :rtype: Version
    """
    received_counter.labels(HTTP_METHOD_GET, VERSION_URL).inc()
    try:
        version = '1.0.0'
        tag = '1.0.0'
        url = "https://api.github.com/repos/fabric-testbesd/CredentialManager/git/refs/tags/{}".format(tag)

        response = Version()
        response.version = version
        response.gitsha1 = 'Not Available'

        result = requests.get(url)
        if result.status_code == 200 and result.json() is not None:
            object_json = result.json().get("object", None)
            if object_json is not None:
                sha = object_json.get("sha", None)
                if sha is not None:
                    response.gitsha1 = sha
        success_counter.labels(HTTP_METHOD_GET, VERSION_URL).inc()
    except Exception as ex:
        LOG.exception(ex)
        failure_counter.labels(HTTP_METHOD_GET, VERSION_URL).inc()
        return str(ex), 500
    return response


def certs_get():  # noqa: E501
    """Return Public Keys to verify signature of the tokens

    Json Web Keys # noqa: E501


    :rtype: List[Jwk]
    """
    received_counter.labels(HTTP_METHOD_GET, CERTS_URL).inc()
    try:
        response = Jwks.from_dict(fabric_jwks)
        LOG.debug(response)
        success_counter.labels(HTTP_METHOD_GET, CERTS_URL).inc()
        return response
    except Exception as ex:
        LOG.exception(ex)
        failure_counter.labels(HTTP_METHOD_GET, CERTS_URL).inc()
        return str(ex), 500
