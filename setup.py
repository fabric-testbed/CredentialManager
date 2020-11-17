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

from setuptools import setup, find_packages

from fabric.credmgr import CONF_DIR, CONF_FILE, LOG_DIR

NAME = "fabric-credmgr"
VERSION = "0.3"
# To install the library, run the following
#
# python setup.py install
#
# prerequisite: setuptools
# http://pypi.python.org/pypi/setuptools

REQUIRES = [
        'requests',
        'requests_oauthlib',
        'connexion',
        'swagger-ui-bundle',
        'python_dateutil',
        'setuptools',
        'psycopg2-binary',
        'sqlalchemy',
        'PyJWT',
        'ldap3',
        'prometheus_client',
        'waitress',
        'six',
        'cryptography'
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
    data_files = [(CONF_DIR, [CONF_FILE]), (LOG_DIR, [])],
    entry_points={
        'console_scripts': ['fabric.credmgr.swagger_server=fabric.credmgr.swagger_server.__main__:main']},
    classifiers=[
                  "Programming Language :: Python :: 3",
                  "License :: OSI Approved :: MIT License",
                  "Operating System :: OS Independent",
              ],
    python_requires='>=3.6'
)
