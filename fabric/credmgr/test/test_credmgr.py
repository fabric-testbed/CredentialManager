import unittest
import requests


class TestCredmgr(unittest.TestCase):
    base_url = "http://localhost:7000/tokens/"
    create_url = base_url + "create"
    refresh_url = base_url + "refresh"
    revoke_url = base_url + "revoke"

    headers = {
        'Accept': 'application/json',
    }

    def test_create_and_get_tokens(self):
        """
        Verify token creation is successful with default project and scope
        Verify get token without authentication fails
        :return:
        """
        # Create tokens with default project and scope
        response = requests.post(url=self.create_url, headers=self.headers)
        self.assertEqual(200, response.status_code)
        message = response.json().get('message', None)
        self.assertIsNotNone(message)
        self.assertEqual(message, 'Missing required parameters id_token or project or scope')
        status = response.json().get('status', None)
        self.assertIsNotNone(status)
        self.assertEqual(status, 500)

    def test_create_tokens_with_unknown_project_scope(self):
        """
        Verify token creation fails with unknown project and scope
        :return:
        """
        query_string = [('projectName', 'project_name_example'),
                        ('scope', 'scope_example')]

        # Create tokens with unknown project and scope
        response = requests.post(url=self.create_url, headers=self.headers, params=query_string)
        self.assertEqual(400, response.status_code)
        value = response.json().get('value', None)
        self.assertIsNone(value)

    def test_create_tokens_and_get_with_project_scope(self):
        """
        Verify token creation succeeds with known project and scope
        Verify get token without authentication fails
        :return:
        """
        query_string = [('projectName', 'RENCI-TEST'),
                        ('scope', 'measurement')]

        # Create tokens with project and scope
        response = requests.post(url=self.create_url, headers=self.headers, params=query_string)
        self.assertEqual(200, response.status_code)
        message = response.json().get('message', None)
        self.assertIsNotNone(message)
        self.assertEqual(message, 'Missing required parameters id_token or project or scope')
        self.assertEqual(500, response.json()['status'])

    def test_refresh_tokens(self):
        # Invalid request
        response = requests.post(url=self.refresh_url, headers=self.headers)
        self.assertEqual(400, response.status_code)

        # valid request but unknown token
        value = {"refresh_token": "https://cilogon.org/oauth2/refreshToken/46438248f4b7691a851f88b0849d9687/1584383387474"}

        response = requests.post(url=self.refresh_url, headers=self.headers, json=value)
        self.assertEqual(200, response.status_code)
        self.assertIsNotNone(response.json().get('status', None))
        self.assertEqual(500, response.json().get('status'))

        query_string = [('projectName', 'RENCI-TEST'),
                        ('scope', 'measurement')]

        # valid request with project and scope but unknown token
        response = requests.post(url=self.refresh_url, headers=self.headers, json=value, params=query_string)
        self.assertEqual(200, response.status_code)
        self.assertIsNotNone(response.json().get('status', None))
        self.assertEqual(500, response.json().get('status'))

        query_string = [('projectName', 'project_name_example'),
                        ('scope', 'scope_example')]

        # valid request with unknonw project and scope but unknown token
        response = requests.post(url=self.refresh_url, headers=self.headers, json=value, params=query_string)
        self.assertEqual(400, response.status_code)

    def test_revoke_tokens(self):
        #invalid request
        response = requests.post(url=self.revoke_url, headers=self.headers)

        self.assertEqual(400, response.status_code)

        value = {
            "refresh_token": "https://cilogon.org/oauth2/refreshToken/46438248f4b7691a851f88b0849d9687/1584383387474"}

        response = requests.post(url=self.revoke_url, headers=self.headers, json=value)
        self.assertEqual(200, response.status_code)
        self.assertIsNotNone(response.json().get('status', None))
        self.assertEqual(500, response.json().get('status'))
