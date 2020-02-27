# coding: utf-8

import sys
from setuptools import setup, find_packages
from credmgr import ConfDir, ConfFile, LogDir

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
        'mod-wsgi'
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
    data_files = [(ConfDir, [ConfFile]), (LogDir, [])],
    scripts = ['bin/credmgr'],
    entry_points={
        'console_scripts': ['credmgr.swagger_server=credmgr.swagger_server.__main__:main']},
)