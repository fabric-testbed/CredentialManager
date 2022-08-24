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

from fabric_cm.credmgr.swagger_server.models.jwks import Jwks
from fabric_cm.credmgr.swagger_server import received_counter, success_counter, failure_counter, fabric_jwks
from fabric_cm.credmgr.swagger_server.response.constants import HTTP_METHOD_GET, CERTS_URL
from fabric_cm.credmgr.logging import LOG
from fabric_cm.credmgr.swagger_server.response.cors_response import cors_200, cors_500


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
        return cors_200(response_body=response)
    except Exception as ex:
        LOG.exception(ex)
        failure_counter.labels(HTTP_METHOD_GET, CERTS_URL).inc()
        return cors_500(details=str(ex))
