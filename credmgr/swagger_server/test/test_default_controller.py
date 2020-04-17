# coding: utf-8

from __future__ import absolute_import

from flask import json
from six import BytesIO

from credmgr.swagger_server.models.create_request import CreateRequest  # noqa: E501
from credmgr.swagger_server.models.cred_mgr_response import CredMgrResponse  # noqa: E501
from credmgr.swagger_server.models.refresh_revoke_request import RefreshRevokeRequest  # noqa: E501
from credmgr.swagger_server.test import BaseTestCase


class TestDefaultController(BaseTestCase):
    """DefaultController integration test stubs"""

    def test_create_post(self):
        """Test case for create_post

        Generate OAuth tokens for an user
        """
        query_string = [('project_name', 'project_name_example'),
                        ('scope', 'scope_example')]
        response = self.client.open(
            '/kthare10/credmgr/1.0.0/create',
            method='POST',
            query_string=query_string)
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    def test_create_with_id_token_post(self):
        """Test case for create_with_id_token_post

        Generate OAuth tokens for an user provided CILogon ID Token
        """
        body = CreateRequest()
        query_string = [('project_name', 'project_name_example'),
                        ('scope', 'scope_example')]
        response = self.client.open(
            '/fabric/credmgr/create',
            method='POST',
            data=json.dumps(body),
            content_type='application/json',
            query_string=query_string)
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    def test_get_get(self):
        """Test case for get_get

        get tokens for an user
        """
        query_string = [('user_id', 'user_id_example')]
        response = self.client.open(
            '/fabric/credmgr/get',
            method='GET',
            query_string=query_string)
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    def test_refresh_post(self):
        """Test case for refresh_post

        Refresh OAuth tokens for an user
        """
        body = RefreshRevokeRequest()
        query_string = [('project_name', 'project_name_example'),
                        ('scope', 'scope_example')]
        response = self.client.open(
            '/fabric/credmgr/refresh',
            method='POST',
            data=json.dumps(body),
            content_type='application/json',
            query_string=query_string)
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    def test_revoke_post(self):
        """Test case for revoke_post

        Revoke a refresh token for an user
        """
        body = RefreshRevokeRequest()
        response = self.client.open(
            '/fabric/credmgr/revoke',
            method='POST',
            data=json.dumps(body),
            content_type='application/json')
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))


if __name__ == '__main__':
    import unittest
    unittest.main()
