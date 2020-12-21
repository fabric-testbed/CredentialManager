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
from datetime import timedelta, datetime

import jwt
from authlib.jose import jwk
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization


class JWTManager:
    @staticmethod
    def encode(*, validity: int, claims: dict, private_key_file_name: str,
               pass_phrase: str, kid: str) -> str:
        """
        sign and base64 encode the token

        @return Returns the encoded string for the Fabric token
        """
        if pass_phrase is not None and pass_phrase != "":
            pass_phrase = pass_phrase.encode("utf-8")
        else:
            pass_phrase = None

        with open(private_key_file_name) as private_key_fh:
            pem_data = private_key_fh.read()
            private_key_fh.close()
            private_key = serialization.load_pem_private_key(data=pem_data.encode("utf-8"),
                                                             password=pass_phrase,
                                                             backend=default_backend())

        claims['iat'] = int(datetime.now().timestamp())
        claims['exp'] = int((datetime.now() + timedelta(seconds=int(validity))).timestamp())

        new_token = str(jwt.encode(claims, private_key, algorithm='RS256', headers={'kid': kid}), 'utf-8')
        return new_token

    @staticmethod
    def encode_public_jwk(public_key_file_name: str, kid: str, alg: str):
        """
        Encode Public JWK
        """
        pem_data = None
        with open(public_key_file_name) as public_key_fh:
            pem_data = public_key_fh.read()
            public_key_fh.close()

        result = jwk.dumps(pem_data, kty='RSA')
        result["kid"] = kid
        result["alg"] = alg
        result["use"] = "sig"
        return result
