from datetime import datetime, timedelta

from fss_utils.jwt_validate import JWTValidator
import prometheus_client

from fabric_cm.credmgr import CONFIG
from fabric_cm.credmgr.utils import LOG
from fabric_cm.credmgr.utils.jwt_manager import JWTManager

received_counter = prometheus_client.Counter('Requests_Received', 'HTTP Requests', ['method', 'endpoint'])
success_counter = prometheus_client.Counter('Requests_Success', 'HTTP Success', ['method', 'endpoint'])
failure_counter = prometheus_client.Counter('Requests_Failed', 'HTTP Failures', ['method', 'endpoint'])

# initialize CI Logon Token Validation
CILOGON_CERTS = CONFIG.get("oauth", "oauth-jwks-url")
CILOGON_KEY_REFRESH = CONFIG.get("oauth", "oauth-key-refresh")
LOG.info(f'Initializing JWT Validator to use {CILOGON_CERTS} endpoint, '
         f'refreshing keys every {CILOGON_KEY_REFRESH} HH:MM:SS')
t = datetime.strptime(CILOGON_KEY_REFRESH, "%H:%M:%S")
jwt_validator = JWTValidator(CILOGON_CERTS,
                             timedelta(hours=t.hour, minutes=t.minute, seconds=t.second))

kid = CONFIG.get("jwt", "jwt-public-key-kid")
public_key = CONFIG.get("jwt", "jwt-public-key")
jwk_public_key_rsa = JWTManager.encode_public_jwk(public_key_file_name=public_key, kid=kid, alg="RS256")
fabric_jwks = {"keys": [jwk_public_key_rsa]}
