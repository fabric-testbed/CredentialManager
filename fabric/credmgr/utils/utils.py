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
"""
Provides utility functions
"""
from fabric.credmgr import CONFIG


def get_providers():
    """
    Constructor providers dict based on the information provided in config file
    """
    if not CONFIG and ('oauth' not in CONFIG):
        raise RuntimeError('OAUTH configuration parameters must be specified in config')

    providers = {}
    provider = CONFIG.get('oauth', "oauth-provider")
    providers[provider] = {}
    providers[provider]['client_id'] = CONFIG.get('oauth', "oauth-client-id")
    providers[provider]['client_secret'] = CONFIG.get('oauth', "oauth-client-secret")
    providers[provider]['token_uri'] = CONFIG.get('oauth', "oauth-token-url")
    providers[provider]['revoke_uri'] = CONFIG.get('oauth', "oauth-revoke-url")

    return providers
