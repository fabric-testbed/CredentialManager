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
VERSION_URL = '/version'
CERTS_URL = '/certs'
TOKENS_CREATE_URL = '/tokens/create'
TOKENS_REFRESH_URL = '/tokens/refresh'
TOKENS_REVOKE_URL = '/tokens/revoke'
TOKENS_REVOKES_URL = '/tokens/revokes'
TOKENS_REVOKE_LIST_URL = '/tokens/revoke_list'
TOKENS_VALIDATE_URL = '/tokens/validate'
TOKENS_DELETE_URL = '/tokens/delete'
TOKENS_DELETE_TOKEN_HASH_URL = '/tokens/delete/{token_hash}'

HTTP_METHOD_GET = 'get'
HTTP_METHOD_POST = 'post'
HTTP_METHOD_DELETE = 'delete'


VOUCH_ID_TOKEN = 'X-Vouch-Idp-IdToken'
VOUCH_REFRESH_TOKEN = 'X-Vouch-Idp-RefreshToken'

AUTHORIZATION_ERR = 'Authorization information is missing or invalid: /tokens'
