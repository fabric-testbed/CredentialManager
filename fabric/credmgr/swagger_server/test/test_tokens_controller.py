# coding: utf-8

from __future__ import absolute_import

from flask import json
from six import BytesIO

from fabric.credmgr.swagger_server.models.refresh_revoke_request import RefreshRevokeRequest  # noqa: E501
from fabric.credmgr.swagger_server.models.success import Success  # noqa: E501
from fabric.credmgr.swagger_server.test import BaseTestCase


class TestTokensController(BaseTestCase):
    """TokensController integration test stubs"""

    def test_tokens_create_post(self):
        """Test case for tokens_create_post

        Generate Fabric OAuth tokens for an user
        """
        query_string = [('project_name', 'all'),
                        ('scope', 'all')]
        response = self.client.open(
            '//tokens/create',
            method='POST',
            query_string=query_string)
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    def test_tokens_refresh_post(self):
        """Test case for tokens_refresh_post

        Refresh FABRIC OAuth tokens for an user
        """
        body = RefreshRevokeRequest()
        query_string = [('project_name', 'all'),
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
        body = RefreshRevokeRequest()
        response = self.client.open(
            '//tokens/revoke',
            method='POST',
            data=json.dumps(body),
            content_type='application/json')
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    def test_tokens_user_idget(self):
        """Test case for tokens_user_idget

        get tokens for an user
        """
        response = self.client.open(
            '//tokens/{userID}'.format(user_id='user_id_example'),
            method='GET')
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))


if __name__ == '__main__':
    import unittest
    unittest.main()
