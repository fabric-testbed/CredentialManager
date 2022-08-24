# coding: utf-8

from __future__ import absolute_import

from flask import json
from six import BytesIO

from fabric_cm.credmgr.swagger_server.models.jwks import Jwks  # noqa: E501
from fabric_cm.credmgr.swagger_server.models.status500_internal_server_error import Status500InternalServerError  # noqa: E501
from fabric_cm.credmgr.swagger_server.test import BaseTestCase


class TestDefaultController(BaseTestCase):
    """DefaultController integration test stubs"""

    def test_certs_get(self):
        """Test case for certs_get

        Return Public Keys to verify signature of the tokens
        """
        response = self.client.open(
            '//certs',
            method='GET')
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))


if __name__ == '__main__':
    import unittest
    unittest.main()
