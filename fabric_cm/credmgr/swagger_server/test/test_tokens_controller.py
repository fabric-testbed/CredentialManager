# coding: utf-8

from __future__ import absolute_import

from flask import json
from six import BytesIO

from fabric_cm.credmgr.swagger_server.models.decoded_token import DecodedToken  # noqa: E501
from fabric_cm.credmgr.swagger_server.models.request import Request  # noqa: E501
from fabric_cm.credmgr.swagger_server.models.revoke_list import RevokeList  # noqa: E501
from fabric_cm.credmgr.swagger_server.models.status200_ok_no_content import Status200OkNoContent  # noqa: E501
from fabric_cm.credmgr.swagger_server.models.status400_bad_request import Status400BadRequest  # noqa: E501
from fabric_cm.credmgr.swagger_server.models.status401_unauthorized import Status401Unauthorized  # noqa: E501
from fabric_cm.credmgr.swagger_server.models.status403_forbidden import Status403Forbidden  # noqa: E501
from fabric_cm.credmgr.swagger_server.models.status404_not_found import Status404NotFound  # noqa: E501
from fabric_cm.credmgr.swagger_server.models.status500_internal_server_error import Status500InternalServerError  # noqa: E501
from fabric_cm.credmgr.swagger_server.models.token_post import TokenPost  # noqa: E501
from fabric_cm.credmgr.swagger_server.models.tokens import Tokens  # noqa: E501
from fabric_cm.credmgr.swagger_server.test import BaseTestCase


class TestTokensController(BaseTestCase):
    """TokensController integration test stubs"""

    def test_tokens_create_post(self):
        """Test case for tokens_create_post

        Generate tokens for an user
        """
        query_string = [('project_id', 'project_id_example'),
                        ('project_name', 'project_name_example'),
                        ('scope', 'all'),
                        ('lifetime', 1512),
                        ('comment', 'Create Token via GUI')]
        response = self.client.open(
            '/credmgr//tokens/create',
            method='POST',
            query_string=query_string)
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    def test_tokens_delete_delete(self):
        """Test case for tokens_delete_delete

        Delete all tokens for a user
        """
        response = self.client.open(
            '/credmgr//tokens/delete',
            method='DELETE')
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    def test_tokens_delete_token_hash_delete(self):
        """Test case for tokens_delete_token_hash_delete

        Delete a token for an user
        """
        response = self.client.open(
            '/credmgr//tokens/delete/{token_hash}'.format(token_hash='token_hash_example'),
            method='DELETE')
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    def test_tokens_get(self):
        """Test case for tokens_get

        Get tokens
        """
        query_string = [('token_hash', 'token_hash_example'),
                        ('project_id', 'project_id_example'),
                        ('expires', 'expires_example'),
                        ('states', 'states_example'),
                        ('limit', 200),
                        ('offset', 1)]
        response = self.client.open(
            '/credmgr//tokens',
            method='GET',
            query_string=query_string)
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    def test_tokens_refresh_post(self):
        """Test case for tokens_refresh_post

        Refresh tokens for an user
        """
        body = Request()
        query_string = [('project_id', 'project_id_example'),
                        ('project_name', 'project_name_example'),
                        ('scope', 'all')]
        response = self.client.open(
            '/credmgr//tokens/refresh',
            method='POST',
            data=json.dumps(body),
            content_type='application/json',
            query_string=query_string)
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    def test_tokens_revoke_list_get(self):
        """Test case for tokens_revoke_list_get

        Get token revoke list i.e. list of revoked identity token hashes
        """
        query_string = [('project_id', 'project_id_example')]
        response = self.client.open(
            '/credmgr//tokens/revoke_list',
            method='GET',
            query_string=query_string)
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    def test_tokens_revoke_post(self):
        """Test case for tokens_revoke_post

        Revoke a token for an user
        """
        body = Request()
        response = self.client.open(
            '/credmgr//tokens/revoke',
            method='POST',
            data=json.dumps(body),
            content_type='application/json')
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    def test_tokens_revokes_post(self):
        """Test case for tokens_revokes_post

        Revoke a token
        """
        body = TokenPost()
        response = self.client.open(
            '/credmgr//tokens/revokes',
            method='POST',
            data=json.dumps(body),
            content_type='application/json')
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    def test_tokens_validate_post(self):
        """Test case for tokens_validate_post

        Validate an identity token issued by Credential Manager
        """
        body = TokenPost()
        response = self.client.open(
            '/credmgr//tokens/validate',
            method='POST',
            data=json.dumps(body),
            content_type='application/json')
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))


if __name__ == '__main__':
    import unittest
    unittest.main()
