# coding: utf-8

from __future__ import absolute_import

import json
from io import BytesIO

from fabric_cm.credmgr.swagger_server.models.status500_internal_server_error import Status500InternalServerError  # noqa: E501
from fabric_cm.credmgr.swagger_server.models.version import Version  # noqa: E501
from fabric_cm.credmgr.swagger_server.test import BaseTestCase


class TestVersionController(BaseTestCase):
    """VersionController integration test stubs"""

    def test_version_get(self):
        """Test case for version_get

        Version
        """
        response = self.client.get('/version')
        self.assert200(response,
                       'Response body is : ' + response.text)


if __name__ == '__main__':
    import unittest
    unittest.main()
