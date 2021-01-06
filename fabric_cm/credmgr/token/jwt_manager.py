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
import gzip
from datetime import timedelta, datetime

import jwt
from authlib.jose import jwk
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization

from fabric_cm.credmgr.common.exceptions import TokenError


class JWTManager:
    @staticmethod
    def encode(*, validity: int, claims: dict, private_key_file_name: str,
               pass_phrase: str, kid: str, algorithm: str) -> str:
        """
        sign and base64 encode the token
        :param validity validity in seconds
        :param claims claims to be added in token
        :param private_key_file_name private key file name used to sign the token
        :param pass_phrase private key pass phrase
        :param kid kid to be added to the header
        :param algorithm algorithm by which to encode the token

        :return Returns the encoded string for the Fabric token
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

        new_token = str(jwt.encode(claims, private_key, algorithm=algorithm, headers={'kid': kid}), 'utf-8')
        return new_token

    @staticmethod
    def encode_public_jwk(*, public_key_file_name: str, kid: str, alg: str):
        """
        Encode Public JWK
        :param public_key_file_name Public Key File Name
        :param kid kid to be added to the Jwk
        :param alg algorithm to be added

        :return JWK for the public key passed
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

    @staticmethod
    def encode_with_compression(*, claims: dict, secret: str, validity: int, algorithm: str = 'HS256',
                                compression: bool = True) -> str:
        """
        Encode a JWT
        :claims incoming claims
        :secret secret
        :validity validity in seconds
        :algorithm algorithm
        :compression compression
        """
        if validity is not None:
            claims['exp'] = int((datetime.now() + timedelta(seconds=int(validity))).timestamp())

        encoded_cookie = jwt.encode(claims, secret, algorithm=algorithm)
        if compression:
            compressed_cookie = gzip.compress(encoded_cookie)
            encoded_cookie = base64.urlsafe_b64encode(compressed_cookie)

        return str(encoded_cookie, 'utf-8')

    @staticmethod
    def decode(*, cookie: str, secret: str = '', verify: bool = True, compression: bool = True) -> dict:
        """
        Decode and validate a JWT
        :cookie incoming cookie
        :secret secret
        :compression compression
        """
        algorithm = None
        try:
            algorithm = jwt.get_unverified_header(cookie).get('alg', None)
        except jwt.DecodeError as e:
            raise TokenError("Unable to parse token {}".format(e))

        if algorithm is None:
            raise TokenError("Token does not specify algorithm")

        if compression:
            decoded_64 = base64.urlsafe_b64decode(cookie)
            uncompressed_cookie = gzip.decompress(decoded_64)
            cookie = uncompressed_cookie

        from fabric_cm.credmgr.logging import LOG
        LOG.debug("Cookie: {}".format(cookie))
        LOG.debug("secret: {}".format(secret))
        LOG.debug("algorithm: {}".format(algorithm))
        LOG.debug("verify: {}".format(verify))
        decoded_cookie = jwt.decode(cookie, secret, algorithms=[algorithm], verify=verify)
        return decoded_cookie
