# coding: utf-8

from __future__ import absolute_import

import json
from io import BytesIO

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
        response = self.client.post(
            '/tokens/create',
            params={
                'project_id': 'project_id_example',
                'project_name': 'project_name_example',
                'scope': 'all',
                'lifetime': 1512,
                'comment': 'Create Token via GUI',
            })
        # Expect 401 since no auth cookie is provided
        self.assertEqual(response.status_code, 401)

    def test_tokens_delete_delete(self):
        """Test case for tokens_delete_delete

        Delete all tokens for a user
        """
        response = self.client.delete('/tokens')
        self.assertEqual(response.status_code, 401)

    def test_tokens_delete_token_hash_delete(self):
        """Test case for tokens_delete_token_hash_delete

        Delete a token for an user
        """
        response = self.client.delete('/tokens/token_hash_example')
        self.assertEqual(response.status_code, 401)

    def test_tokens_get(self):
        """Test case for tokens_get

        Get tokens
        """
        response = self.client.get(
            '/tokens',
            params={
                'token_hash': 'token_hash_example',
                'project_id': 'project_id_example',
                'expires': 'expires_example',
                'states': 'states_example',
                'limit': 200,
                'offset': 1,
            })
        self.assertEqual(response.status_code, 401)

    def test_tokens_refresh_post(self):
        """Test case for tokens_refresh_post

        Refresh tokens for an user
        """
        response = self.client.post(
            '/tokens/refresh',
            json={'refresh_token': 'test_token'},
            params={
                'project_id': 'project_id_example',
                'project_name': 'project_name_example',
                'scope': 'all',
            })
        # This endpoint doesn't require auth, but will fail at the business logic level
        self.assertIn(response.status_code, [200, 500])

    def test_tokens_revoke_list_get(self):
        """Test case for tokens_revoke_list_get

        Get token revoke list i.e. list of revoked identity token hashes
        """
        response = self.client.get(
            '/tokens/revoke_list',
            params={'project_id': 'project_id_example'})
        self.assertIn(response.status_code, [200, 500])

    def test_tokens_revoke_post(self):
        """Test case for tokens_revoke_post

        Revoke a token for an user
        """
        response = self.client.post(
            '/tokens/revoke',
            json={'refresh_token': 'test_token'})
        self.assertEqual(response.status_code, 401)

    def test_tokens_revokes_post(self):
        """Test case for tokens_revokes_post

        Revoke a token
        """
        response = self.client.post(
            '/tokens/revokes',
            json={'type': 'identity', 'token': 'test_token'})
        self.assertEqual(response.status_code, 401)

    def test_tokens_validate_post(self):
        """Test case for tokens_validate_post

        Validate an identity token issued by Credential Manager
        """
        response = self.client.post(
            '/tokens/validate',
            json={'type': 'identity', 'token': 'test_token'})
        self.assertIn(response.status_code, [200, 500])


if __name__ == '__main__':
    import unittest
    unittest.main()
