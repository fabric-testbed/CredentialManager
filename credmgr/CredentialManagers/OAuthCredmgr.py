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
import base64

from credmgr.CredentialManagers.AbstractCredentialManager import AbstractCredentialManager
from credmgr.utils import generate_user_key, get_providers
import socket

from credmgr.utils.database import Database, IdTokens
from credmgr.utils.token import FabricToken

try:
    from requests_oauthlib import OAuth2Session
except:
    OAuth2Session = None
import os
import time
import glob
import re
import requests
from credmgr import CONFIG


class OAuthCredmgr(AbstractCredentialManager):
    """
    Credential Manager class responsible for handling various operations supported by REST APIs
    It also provides support for scanning and cleaning up of expired tokens and key files.
    """

    def __init__(self, *args, **kw):
        super(OAuthCredmgr, self).__init__(*args, **kw)

    def should_delete(self, token:IdTokens):
        """
        Checks if refresh token in the database has expired and can be deleted
        """
        return False

    def scan_tokens(self):
        """
        Scan the Credential Directory to cleanup the old key files or delete the expired tokens from database
        """
        # loop over all tokens in the database
        db = Database()
        tokens = db.read_all_tokens()
        for token in tokens:
            if self.should_delete(token):
                self.log.info('%s tokens for user %s are marked for deletion', token.refresh_token, token.user_id)
                db.delete_tokens(token)

        # also cleanup any stale key files
        self.cleanup_key_files()

    def cleanup_key_files(self):
        """
        Cleanup the stale key files from cred_dir
        """

        # key filenames are hashes with str len 64
        key_file_re = re.compile(r'^[a-f0-9]{64}$')

        # loop over all possible key files in cred_dir
        key_files = glob.glob(os.path.join(self.cred_dir, '?'*64))
        for key_file in key_files:
            if ((not key_file_re.match(os.path.basename(key_file)))
                    or os.path.isdir(key_file)):
                continue

            try:
                ctime = os.stat(key_file).st_ctime
            except OSError as os_error:
                self.log.error('Could not stat key file %s: %s', key_file, os_error)
                continue

            # remove key files if over 12 hours old
            if time.time() - ctime > 12*3600:
                self.log.info('Removing stale key file %s', os.path.basename(key_file))
                try:
                    os.unlink(key_file)
                except OSError as os_error:
                    self.log.error('Could not remove key file %s: %s', key_file, os_error)

    def create_token(self, project, scope):
        """
        Generates key file and return authorization url for user to authenticate itself and also returns user id

        @param project: Project for which token is requested, by default it is set to 'all'
        @param scope: Scope of the requested token, by default it is set to 'all'

        @returns dictionary containing authorization_url and user_id
        @raises Exception in case of error
        """

        if project is None or scope is None:
            raise OAuthCredMgrError("CredMgr: Cannot request to create a token, Missing required parameter 'project' or 'scope'!")

        user_file = generate_user_key(project, scope)
        if user_file is None:
            raise OAuthCredMgrError("CredMgr:user_file could not be generate!")
        port = CONFIG.get("runtime", "port")
        url = "https://{}:{}/key/{}".format(socket.getfqdn(), port, user_file)
        result = {"authorization_url": url, "user_id": user_file}
        self.log.info(result)
        return result

    def refresh_token(self, user_id, refresh_token):
        """
        Refreshes a token from CILogon and generates Fabric token using project and scope saved in Database

        @returns dictionary containing tokens and user_id
        @raises Exception in case of error
        """

        if OAuth2Session is None or refresh_token is None:
            raise ImportError("No module named OAuth2Session or refresh_token not provided")

        database = Database()
        tokens = database.read_tokens(user_id)

        if tokens.refresh_token != refresh_token:
            raise OAuthCredMgrError("Refresh token invalid, does not match!")

        provider = CONFIG.get('oauth', "oauth-provider")
        providers = get_providers()

        refresh_token_dict = {"refresh_token": refresh_token}

        # refresh the token (provides both new refresh and access tokens)
        oauth_client = OAuth2Session(providers[provider]['client_id'], token = refresh_token_dict)
        new_token = oauth_client.refresh_token(providers[provider]['token_uri'],
                                                   client_id = providers[provider]['client_id'],
                                                   client_secret = providers[provider]['client_secret'])
        try:
            refresh_token = new_token.pop('refresh_token')
            id_token = new_token.pop('id_token')
        except KeyError:
            self.log.error("No refresh or id token returned")
            return None

        self.log.debug("Before: {}".format(id_token))
        fabric_token = FabricToken(id_token, tokens.project, tokens.scope)
        fabric_token.decode()
        fabric_token.update()
        id_token = fabric_token.encode()
        self.log.debug("After: {}".format(id_token))

        result = {"user_id": user_id, "id_token": id_token, "refresh_token":refresh_token}

        return result

    def revoke_token(self, user_id, refresh_token):
        """
        Revoke a refresh token

        @returns dictionary containing status of the operation
        @raises Exception in case of error
        """
        if OAuth2Session is None or refresh_token is None:
            raise ImportError("No module named OAuth2Session or revoke_token not provided")

        database = Database()
        token = database.read_tokens(user_id)

        if token is None or token.refresh_token != refresh_token:
            self.log.error("Refresh token not found in DB or does not match with DB!")

        provider = CONFIG.get('oauth', "oauth-provider")
        providers = get_providers()

        auth = providers[provider]['client_id'] + ":" + providers[provider]['client_secret']
        encoded_auth = base64.b64encode(bytes(auth, "utf-8"))

        headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + str(encoded_auth, "utf-8")
        }

        data = "token={}&token_type_hint=refresh_token".format(refresh_token)

        response = requests.post(providers[provider]['revoke_uri'], headers=headers, data=data)
        self.log.debug("Response Status={}".format(response.status_code))
        self.log.debug("Response Reason={}".format(response.reason))
        self.log.debug(str(response.content,  "utf-8"))
        if response.status_code == 200:
            database.delete_tokens(token)
        else:
            raise OAuthCredMgrError(str(response.content,  "utf-8"))

    def get_token(self, user_id) -> dict:
        """
        Returns the token for user_id returned via Create API after authentication

        @returns dictionary containing tokens and user_id
        """
        if user_id is None:
            raise OAuthCredMgrError("CredMgr: Cannot request to get a token, Missing required parameter 'user_id'!")

        db = Database()
        token = db.read_tokens(user_id)
        result = {"user_id": token.user_id, "id_token": token.id_token, "refresh_token": token.refresh_token}

        return result


class OAuthCredMgrError(Exception):
    pass