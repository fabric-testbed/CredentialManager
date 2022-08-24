# coding: utf-8

from __future__ import absolute_import

from flask import json
from six import BytesIO

from fabric_cm.credmgr.swagger_server.models.request import Request  # noqa: E501
from fabric_cm.credmgr.swagger_server.models.status200_ok_no_content import Status200OkNoContent  # noqa: E501
from fabric_cm.credmgr.swagger_server.models.status400_bad_request import Status400BadRequest  # noqa: E501
from fabric_cm.credmgr.swagger_server.models.status401_unauthorized import Status401Unauthorized  # noqa: E501
from fabric_cm.credmgr.swagger_server.models.status403_forbidden import Status403Forbidden  # noqa: E501
from fabric_cm.credmgr.swagger_server.models.status404_not_found import Status404NotFound  # noqa: E501
from fabric_cm.credmgr.swagger_server.models.status500_internal_server_error import Status500InternalServerError  # noqa: E501
from fabric_cm.credmgr.swagger_server.models.tokens import Tokens  # noqa: E501
from fabric_cm.credmgr.swagger_server.test import BaseTestCase


class TestTokensController(BaseTestCase):
    """TokensController integration test stubs"""

    def test_tokens_create_post(self):
        """Test case for tokens_create_post

        Generate tokens for an user
        """
        query_string = [('project_id', 'project_id_example'),
                        ('scope', 'all')]
        response = self.client.open(
            '//tokens/create',
            method='POST',
            query_string=query_string)
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    def test_tokens_refresh_post(self):
        """Test case for tokens_refresh_post

        Refresh tokens for an user
        """
        body = Request()
        query_string = [('project_id', 'project_id_example'),
                        ('scope', 'all')]
        response = self.client.open(
            '//tokens/refresh',
            method='POST',
            data=json.dumps(body),
            content_type='application/json',
            query_string=query_string)
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    def test_tokens_revoke_post(self):
        """Test case for tokens_revoke_post

        Revoke a refresh token for an user
        """
        body = Request()
        response = self.client.open(
            '//tokens/revoke',
            method='POST',
            data=json.dumps(body),
            content_type='application/json')
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))


if __name__ == '__main__':
    import unittest
    unittest.main()
