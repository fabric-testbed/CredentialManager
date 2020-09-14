#!/usr/bin/env bash
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

ROOT_DIR=$(pwd)

if [ ! -d $ROOT_DIR/certs ]; then
  mkdir -p $ROOT_DIR/certs
else
  rm -f $ROOT_DIR/certs/*
fi

cd $ROOT_DIR/certs
openssl req -x509 -newkey rsa:2048 -sha256 -days 365 -nodes \
  -keyout self.signed.key -out self.signed.crt -config $ROOT_DIR/req.cnf

KEYLENGTH=2048
pubprivfile=combined.pem
pubfile=public.pem
keyfile=private.pem

# generate combined private+public key
openssl genpkey -algorithm rsa -pkeyopt rsa_keygen_bits:${KEYLENGTH} -outform pem -out ${pubprivfile} >& /dev/null

# split up into private and public keys
openssl rsa -in ${pubprivfile} -outform PEM -pubout -out ${pubfile} >& /dev/null
openssl rsa -in ${pubprivfile} -outform PEM -out ${keyfile} >& /dev/null

cd -

exit 0;
