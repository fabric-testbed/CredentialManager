# coding: utf-8

from __future__ import absolute_import

import json
from io import BytesIO

from fabric_cm.credmgr.swagger_server.models.jwks import Jwks  # noqa: E501
from fabric_cm.credmgr.swagger_server.models.status500_internal_server_error import Status500InternalServerError  # noqa: E501
from fabric_cm.credmgr.swagger_server.test import BaseTestCase


class TestDefaultController(BaseTestCase):
    """DefaultController integration test stubs"""

    def test_certs_get(self):
        """Test case for certs_get

        Return Public Keys to verify signature of the tokens
        """
        response = self.client.get('/certs')
        self.assert200(response,
                       'Response body is : ' + response.text)


if __name__ == '__main__':
    import unittest
    unittest.main()
