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
import configparser
from datetime import datetime
from typing import List

from fabric_cm.credmgr.common.exceptions import ConfigError


class Config:
    # Sections
    SECTION_RUNTIME = 'runtime'
    SECTION_LOGGING = 'logging'
    SECTION_OAUTH = 'oauth'
    SECTION_LDAP = 'ldap'
    SECTION_JWT = 'jwt'
    SECTION_PROJECT_REGISTRY = 'project-registry'
    SECTION_VOUCH = 'vouch'

    # Runtime parameters
    REST_PORT = 'rest-port'
    PROMETHEUS_PORT = 'prometheus-port'
    ENABLE_PROJECT_REGISTRY = 'enable-project-registry'
    ENABLE_VOUCH_COOKIE = 'enable-vouch-cookie'
    TOKEN_LIFETIME = 'token-lifetime'
    PROJECT_NAMES_IGNORE_LIST = 'prject-names-ignore-list'
    ROLES_LIST = 'roles-list'
    ALLOWED_SCOPES = 'allowed-scopes'

    # Logging Parameters
    LOGGER = 'logger'
    LOG_DIR = 'log-directory'
    LOG_FILE = 'log-file'
    LOG_RETAIN = 'log-retain'
    LOG_SIZE = 'log-size'
    LOG_LEVEL = 'log-level'

    # Oauth Parameters
    PROVIDER = 'oauth-provider'
    TOKEN_URL = 'oauth-token-url'
    REVOKE_URL = 'oauth-revoke-url'
    JWKS_URL = 'oauth-jwks-url'
    KEY_REFRESH = 'oauth-key-refresh'
    CLIENT_ID = 'oauth-client-id'
    CLIENT_SECRET = 'oauth-client-secret'

    # LDAP Parameters
    LDAP_HOST = 'ldap-host'
    LDAP_USER = 'ldap-user'
    LDAP_PASSWORD = 'ldap-password'
    LDAP_SEARCH_BASE = 'ldap-search-base'

    # JWT Parameters
    JWT_PUBLIC_KEY = 'jwt-public-key'
    JWT_PUBLIC_KEY_KID = 'jwt-public-key-kid'
    JWT_PRIVATE_KEY = 'jwt-private-key'
    JWT_PRIVATE_KEY_PASS_PHRASE = 'jwt-pass-phrase'

    # Project Registry Parameters
    PROJECT_REGISTRY_URL = 'project-registry-url'
    SSL_VERIFY = 'ssl_verify'

    # Vouch Parameters
    VOUCH = 'vouch'
    SECRET = 'secret'
    COMPRESSION = 'compression'
    CUSTOM_CLAIMS = 'custom_claims'
    LIFETIME = 'lifetime'
    COOKIE_NAME = 'cookie-name'
    COOKIE_DOMAIN_NAME = 'cookie-domain-name'

    def __init__(self, config_parser: configparser.ConfigParser):
        self.config_parser = config_parser

    def _get_config_from_section(self, section_name: str, parameter_name: str) -> str:
        try:
            return self.config_parser.get(section_name, parameter_name)
        except Exception as e:
            raise ConfigError("Missing {} in section {} Error: {}".format(parameter_name, section_name, e))

    def get_rest_port(self) -> int:
        return int(self._get_config_from_section(self.SECTION_RUNTIME, self.REST_PORT))

    def get_prometheus_port(self) -> int:
        return int(self._get_config_from_section(self.SECTION_RUNTIME, self.PROMETHEUS_PORT))

    def is_project_registry_enabled(self) -> bool:
        value = self._get_config_from_section(self.SECTION_RUNTIME, self.ENABLE_PROJECT_REGISTRY)
        if value.lower() == 'true':
            return True
        return False

    def is_vouch_cookie_enabled(self) -> bool:
        value = self._get_config_from_section(self.SECTION_RUNTIME, self.ENABLE_VOUCH_COOKIE)
        if value.lower() == 'true':
            return True
        return False

    def get_allowed_scopes(self) -> str:
        return self._get_config_from_section(self.SECTION_RUNTIME, self.ALLOWED_SCOPES)

    def get_roles(self) -> str:
        return self._get_config_from_section(self.SECTION_RUNTIME, self.ROLES_LIST)

    def get_project_ignore_list(self) -> str:
        return self._get_config_from_section(self.SECTION_RUNTIME, self.PROJECT_NAMES_IGNORE_LIST)

    def get_token_life_time(self) -> int:
        return int(self._get_config_from_section(self.SECTION_RUNTIME, self.TOKEN_LIFETIME))

    def get_logger_name(self) -> str:
        return self._get_config_from_section(self.SECTION_LOGGING, self.LOGGER)

    def get_logger_dir(self) -> str:
        return self._get_config_from_section(self.SECTION_LOGGING, self.LOG_DIR)

    def get_logger_file(self) -> str:
        return self._get_config_from_section(self.SECTION_LOGGING, self.LOG_FILE)

    def get_logger_level(self) -> str:
        return self._get_config_from_section(self.SECTION_LOGGING, self.LOG_LEVEL)

    def get_logger_retain(self) -> int:
        return int(self._get_config_from_section(self.SECTION_LOGGING, self.LOG_RETAIN))

    def get_logger_size(self) -> int:
        return int(self._get_config_from_section(self.SECTION_LOGGING, self.LOG_SIZE))

    def get_jwt_public_key(self) -> str:
        return self._get_config_from_section(self.SECTION_JWT, self.JWT_PUBLIC_KEY)

    def get_jwt_public_key_kid(self) -> str:
        return self._get_config_from_section(self.SECTION_JWT, self.JWT_PUBLIC_KEY_KID)

    def get_jwt_private_key(self) -> str:
        return self._get_config_from_section(self.SECTION_JWT, self.JWT_PRIVATE_KEY)

    def get_jwt_private_key_pass_phrase(self) -> str:
        return self._get_config_from_section(self.SECTION_JWT, self.JWT_PRIVATE_KEY_PASS_PHRASE)

    def get_oauth_provider(self) -> str:
        return self._get_config_from_section(self.SECTION_OAUTH, self.PROVIDER)

    def get_oauth_token_url(self) -> str:
        return self._get_config_from_section(self.SECTION_OAUTH, self.TOKEN_URL)

    def get_oauth_jwks_url(self) -> str:
        return self._get_config_from_section(self.SECTION_OAUTH, self.JWKS_URL)

    def get_oauth_revoke_url(self) -> str:
        return self._get_config_from_section(self.SECTION_OAUTH, self.REVOKE_URL)

    def get_oauth_client_id(self) -> str:
        return self._get_config_from_section(self.SECTION_OAUTH, self.CLIENT_ID)

    def get_oauth_client_secret(self) -> str:
        return self._get_config_from_section(self.SECTION_OAUTH, self.CLIENT_SECRET)

    def get_oauth_key_refresh(self) -> datetime:
        value = self._get_config_from_section(self.SECTION_OAUTH, self.KEY_REFRESH)
        return datetime.strptime(value, "%H:%M:%S")

    def get_ldap_host(self):
        return self._get_config_from_section(self.SECTION_LDAP, self.LDAP_HOST)

    def get_ldap_user(self):
        return self._get_config_from_section(self.SECTION_LDAP, self.LDAP_USER)

    def get_ldap_pwd(self):
        return self._get_config_from_section(self.SECTION_LDAP, self.LDAP_PASSWORD)

    def get_ldap_search_base(self):
        return self._get_config_from_section(self.SECTION_LDAP, self.LDAP_SEARCH_BASE)

    def is_pr_ssl_verify(self) -> bool:
        value = self._get_config_from_section(self.SECTION_PROJECT_REGISTRY, self.SSL_VERIFY)
        if value.lower() == 'true':
            return True
        return False

    def get_pr_url(self) -> str:
        return self._get_config_from_section(self.SECTION_PROJECT_REGISTRY, self.PROJECT_REGISTRY_URL)

    def get_vouch_secret(self) -> str:
        return self._get_config_from_section(self.SECTION_VOUCH, self.SECRET)

    def is_vouch_cookie_compressed(self) -> bool:
        value = self._get_config_from_section(self.SECTION_VOUCH, self.COMPRESSION)
        if value.lower() == 'true':
            return True
        return False

    def get_vouch_custom_claims(self) -> List[str]:
        value = self._get_config_from_section(self.SECTION_VOUCH, self.CUSTOM_CLAIMS)
        return value.split(',')

    def get_vouch_cookie_lifetime(self) -> int:
        return int(self._get_config_from_section(self.SECTION_VOUCH, self.LIFETIME))

    def get_vouch_cookie_name(self) -> str:
        return self._get_config_from_section(self.SECTION_VOUCH, self.COOKIE_NAME)

    def get_vouch_cookie_domain_name(self) -> str:
        return self._get_config_from_section(self.SECTION_VOUCH, self.COOKIE_DOMAIN_NAME)

    def get_providers(self) -> dict:
        """
        Constructor providers dict based on the information provided in config file
        """
        providers = {}
        provider = self.get_oauth_provider()
        providers[provider] = {}
        providers[provider]['client_id'] = self.get_oauth_client_id()
        providers[provider]['client_secret'] = self.get_oauth_client_secret()
        providers[provider]['token_uri'] = self.get_oauth_token_url()
        providers[provider]['revoke_uri'] = self.get_oauth_revoke_url()

        return providers
