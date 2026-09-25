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


class TokenError(Exception):
    """
    Token Exception
    """


class ConfigError(Exception):
    """
    Config Exception
    """

class OAuthCredMgrError(Exception):
    """A CredMgr error that is safe to show the caller.

    Raised deliberately, so the message is written for a user and the status
    code is known at the raise site. Lives here rather than in
    oauth_credmgr.py, which cannot be imported without a database section in
    the config - an exception type should not need one, and the response layer
    has to be able to recognise this class to answer with it.
    """
    def __init__(self, message: str, http_error_code: int = 500):
        super().__init__(message)
        self.http_error_code = http_error_code

    def get_http_error_code(self) -> int:
        return self.http_error_code
