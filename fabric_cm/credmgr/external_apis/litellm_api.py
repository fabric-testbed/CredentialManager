#!/usr/bin/env python3
# MIT License
#
# Copyright (c) 2020 FABRIC Testbed
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.
#
# Author Komal Thareja (kthare10@renci.org)
import requests

from fabric_cm.credmgr.logging import LOG


class LiteLLMApi:
    """
    Class implements functionality to interface with LiteLLM Proxy API
    for user management, team management, and key management.
    """
    def __init__(self, api_server: str, master_key: str):
        self.api_server = api_server.rstrip('/')

        if self.api_server is None:
            raise LiteLLMApiError("LiteLLM URL not available")

        if master_key is None:
            raise LiteLLMApiError("LiteLLM master key not available")

        headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {master_key}'
        }

        self.session = requests.Session()
        self.session.headers.update(headers)

    # ---- User Management ----

    def create_user(self, user_id: str, user_email: str, max_budget: float = None) -> dict:
        """
        Create a new user in LiteLLM
        @param user_id FABRIC user UUID
        @param user_email User's email
        @param max_budget Maximum budget for the user
        @return dict with user_id, key, expires, max_budget
        """
        url = f'{self.api_server}/user/new'

        payload = {
            'user_id': user_id,
            'user_email': user_email
        }
        if max_budget is not None:
            payload['max_budget'] = max_budget

        LOG.debug(f"LiteLLM create_user request: {url}")
        response = self.session.post(url, json=payload)

        if response.status_code != 200:
            raise LiteLLMApiError(f"LiteLLM API error creating user: status_code={response.status_code} "
                                  f"message={response.text}")

        LOG.debug(f"LiteLLM create_user completed: status_code={response.status_code}")
        return response.json()

    def get_user_info(self, user_id: str) -> dict:
        """
        Get user info from LiteLLM
        @param user_id User identifier
        @return dict with user info
        """
        url = f'{self.api_server}/user/info'

        LOG.debug(f"LiteLLM get_user_info request: {url}")
        response = self.session.get(url, params={'user_id': user_id})

        if response.status_code != 200:
            raise LiteLLMApiError(f"LiteLLM API error getting user info: status_code={response.status_code} "
                                  f"message={response.text}")

        LOG.debug(f"LiteLLM get_user_info completed: status_code={response.status_code}")
        return response.json()

    # ---- Team Management ----

    def add_user_to_team(self, team_id: str, user_id: str, max_budget_in_team: float = None) -> dict:
        """
        Add a user to a team in LiteLLM
        @param team_id Team identifier
        @param user_id User identifier
        @param max_budget_in_team Max budget for user within team
        @return response dict
        """
        url = f'{self.api_server}/team/member_add'

        payload = {
            'team_id': team_id,
            'member': {
                'role': 'user',
                'user_id': user_id
            }
        }
        if max_budget_in_team is not None:
            payload['max_budget_in_team'] = max_budget_in_team

        LOG.debug(f"LiteLLM add_user_to_team request: {url}")
        response = self.session.post(url, json=payload)

        if response.status_code != 200:
            raise LiteLLMApiError(f"LiteLLM API error adding user to team: status_code={response.status_code} "
                                  f"message={response.text}")

        LOG.debug(f"LiteLLM add_user_to_team completed: status_code={response.status_code}")
        return response.json()

    # ---- Key Management ----

    def generate_key(self, user_id: str, user_email: str, team_id: str = None,
                     key_alias: str = None, duration: str = None,
                     max_budget: float = None, metadata: dict = None) -> dict:
        """
        Generate a new LiteLLM API key
        @param user_id FABRIC user UUID
        @param user_email User's email
        @param team_id Team identifier
        @param key_alias Human-readable alias for the key
        @param duration Key duration (e.g. '30d')
        @param max_budget Maximum budget for the key
        @param metadata Additional metadata
        @return dict with key, token, key_alias, etc.
        """
        url = f'{self.api_server}/key/generate'

        payload = {
            'user_id': user_id,
            'metadata': metadata or {'user_email': user_email}
        }

        if team_id is not None:
            payload['team_id'] = team_id
        if key_alias is not None:
            payload['key_alias'] = key_alias
        if duration is not None:
            payload['duration'] = duration
        if max_budget is not None:
            payload['max_budget'] = max_budget

        LOG.debug(f"LiteLLM generate_key request: {url}")
        response = self.session.post(url, json=payload)

        if response.status_code != 200:
            raise LiteLLMApiError(f"LiteLLM API error generating key: status_code={response.status_code} "
                                  f"message={response.text}")

        LOG.debug(f"LiteLLM generate_key completed: status_code={response.status_code}")
        return response.json()

    def list_keys(self, user_id: str) -> list:
        """
        List all keys for a user from LiteLLM via /user/info endpoint.
        The /key/list endpoint requires a virtual key, so we use /user/info
        which works with the master key and returns the user's keys.
        @param user_id User identifier
        @return list of key records
        """
        try:
            user_info = self.get_user_info(user_id=user_id)
        except LiteLLMApiError:
            return []

        keys = user_info.get('keys', [])
        return keys

    def delete_key(self, key_id: str) -> dict:
        """
        Delete a LiteLLM API key
        @param key_id Key identifier (token field from LiteLLM)
        @return response dict
        """
        url = f'{self.api_server}/key/delete'

        payload = {
            'keys': [key_id]
        }

        LOG.debug(f"LiteLLM delete_key request: {url}")
        response = self.session.post(url, json=payload)

        if response.status_code != 200:
            raise LiteLLMApiError(f"LiteLLM API error deleting key: status_code={response.status_code} "
                                  f"message={response.text}")

        LOG.debug(f"LiteLLM delete_key completed: status_code={response.status_code}")
        return response.json()

    def get_key_info(self, key_id: str) -> dict:
        """
        Get info about a LiteLLM API key
        @param key_id Key identifier (token field from LiteLLM)
        @return response dict with key info
        """
        url = f'{self.api_server}/key/info'

        LOG.debug(f"LiteLLM get_key_info request: {url}")
        response = self.session.get(url, params={'key': key_id})

        if response.status_code != 200:
            raise LiteLLMApiError(f"LiteLLM API error getting key info: status_code={response.status_code} "
                                  f"message={response.text}")

        LOG.debug(f"LiteLLM get_key_info completed: status_code={response.status_code}")
        return response.json()


class LiteLLMApiError(Exception):
    """
    LiteLLM API Exception
    """
    pass
