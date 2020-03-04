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
# coding: utf-8

import sys
from setuptools import setup, find_packages
from credmgr import *

NAME = "credmgr"
VERSION = "1.0.0"
# To install the library, run the following
#
# python setup.py install
#
# prerequisite: setuptools
# http://pypi.python.org/pypi/setuptools

REQUIRES = [
        'requests_oauthlib',
        'six',
        'flask',
        'connexion == 2.6.0',
        'python_dateutil == 2.6.0',
        'setuptools >= 21.0.0',
        'mod-wsgi',
        'python-daemon'
        ]

setup(
    name=NAME,
    version = VERSION,
    description="Fabric Credential Manager API",
    author_email="kthare10@renci.org",
    long_description=open('README.md').read(),
    long_description_content_type="text/markdown",
    url='https://github.com/fabric-testbed/CredentialManager',
    author='Komal Thareja',
    keywords=["Swagger", "Fabric Credential Manager API"],
    license='MIT',
    install_requires = REQUIRES,
    packages=find_packages(),
    package_data={'': ['swagger/swagger.yaml']},
    include_package_data=True,
    data_files = [(ConfDir, [ConfFile]), (LogDir, []), (HttpConfDir, [HttpConfFile]), (WsgiDir, [WsgiFile]), (SystemdDir, [CredmgrInitScript, CredmgrSwaggerInitScript])],
    scripts = ['bin/credmgrd'],
    entry_points={
        'console_scripts': ['credmgr.swagger_server=credmgr.swagger_server.__main__:main']},
)