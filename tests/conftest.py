"""Make the package importable outside a deployed container.

`fabric_cm.credmgr` builds its ConfigParser at import time, and several modules
read from it while being imported - the logging helper creates the configured
directory, and the response layer reads the oauth section. None of that is
reachable from a checkout, so supply the minimum here, before anything else
imports.

Only values with no security meaning. Nothing here stands in for a credential.
"""
import os
import tempfile

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

import fabric_cm.credmgr as credmgr


def _throwaway_keypair(directory: str) -> tuple:
    """An RSA pair generated for this run only.

    The token encoder parses the configured private key while being imported,
    so the module cannot load without one. Generated rather than committed:
    a key in the repository is a key someone eventually trusts.
    """
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private = os.path.join(directory, "test-private.pem")
    public = os.path.join(directory, "test-public.pem")
    with open(private, "wb") as fh:
        fh.write(key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        ))
    with open(public, "wb") as fh:
        fh.write(key.public_key().public_bytes(
            serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        ))
    return private, public

CONFIG = credmgr.CONFIG
_TMP = tempfile.mkdtemp(prefix="credmgr-test-")
CONFIG.set("logging", "log-directory", _TMP)
_PRIVATE, _PUBLIC = _throwaway_keypair(_TMP)

for section, values in {
    "oauth": {
        "oauth-provider": "cilogon",
        "oauth-client-id": "test",
        "oauth-client-secret": "test",
        "oauth-jwks-url": "https://example.invalid/jwks",
        "oauth-token-url": "https://example.invalid/token",
        "oauth-revoke-url": "https://example.invalid/revoke",
        "oauth-key-refresh": "00:10:00",
    },
    "database": {
        "db-user": "test",
        "db-password": "test",
        "db-name": "test",
        "db-host": os.getenv("CREDMGR_TEST_DB_HOST", "localhost:5432"),
    },
    "jwt": {
        "jwt-public-key": _PUBLIC,
        "jwt-private-key": _PRIVATE,
        "jwt-pass-phrase": "",
        "jwt-public-key-kid": "test-kid",
    },
    "ldap": {
        "ldap-host": "ldaps://example.invalid",
        "ldap-user": "test",
        "ldap-password": "test",
        "ldap-search-base": "dc=example,dc=invalid",
    },
    "llm": {
        "llm-url": "https://example.invalid",
        "llm-api-key": "test",
        "llm-team-id": "test",
        "llm-allowed-project": "test",
        "llm-default-duration": "30d",
        "llm-default-max-budget": "10",
    },
    "core-api": {
        "core-api-url": "https://example.invalid",
        "ssl_verify": "False",
    },
    "vouch": {
        "secret": "test",
        "cookie-name": "test",
        "cookie-domain-name": "example.invalid",
        "lifetime": "3600",
        "compression": "True",
        "custom_claims": "",
    },
    "runtime": {
        "base-url": "https://example.invalid",
        "token-lifetime": "24",
        "allowed-scopes": "cf,mf,all",
        "prometheus-port": "0",
        "enable-core-api": "False",
        "enable-vouch-cookie": "False",
        "roles-list": "",
        "llt-role-suffix": "-llt",
        "max-llt-count-per-project": "3",
        "project-names-ignore-list": "",
        "facility-operators-role": "facility-operators",
        "cors-allowed-origins": "*",
    },
}.items():
    if not CONFIG.has_section(section):
        CONFIG.add_section(section)
    for key, value in values.items():
        CONFIG.set(section, key, value)
