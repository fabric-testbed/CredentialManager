# coding: utf-8

from __future__ import absolute_import

from flask import json

from credmgr.swagger_server.models.refresh_request import RefreshRequest  # noqa: E501
from credmgr.swagger_server.test import BaseTestCase


class TestDefaultController(BaseTestCase):
    """DefaultController integration test stubs"""

    def test_create_post(self):
        """Test case for create_post

        create tokens for an user
        """
        query_string = [('user_name', 'user_name_example')]
        response = self.client.open(
            '/kthare10/credmgr/1.0.0/create',
            method='POST',
            query_string=query_string)
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    def test_get_get(self):
        """Test case for get_get

        get tokens for an user
        """
        query_string = [('user_name', 'user_name_example')]
        response = self.client.open(
            '/kthare10/credmgr/1.0.0/get',
            method='GET',
            query_string=query_string)
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    def test_refresh_post(self):
        """Test case for refresh_post

        refresh tokens
        """
        body = RefreshRequest()
        response = self.client.open(
            '/kthare10/credmgr/1.0.0/refresh',
            method='POST',
            data=json.dumps(body),
            content_type='application/json')
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))


if __name__ == '__main__':
    import unittest
    unittest.main()
