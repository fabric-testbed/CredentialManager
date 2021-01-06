from datetime import timedelta

from fss_utils.jwt_validate import JWTValidator
import prometheus_client

from fabric_cm.credmgr.config import CONFIG_OBJ
from fabric_cm.credmgr.logging import LOG
from fabric_cm.credmgr.token.jwt_manager import JWTManager

received_counter = prometheus_client.Counter('Requests_Received', 'HTTP Requests', ['method', 'endpoint'])
success_counter = prometheus_client.Counter('Requests_Success', 'HTTP Success', ['method', 'endpoint'])
failure_counter = prometheus_client.Counter('Requests_Failed', 'HTTP Failures', ['method', 'endpoint'])

# initialize CI Logon Token Validation
CILOGON_CERTS = CONFIG_OBJ.get_oauth_jwks_url()
CILOGON_KEY_REFRESH = CONFIG_OBJ.get_oauth_key_refresh()
LOG.info(f'Initializing JWT Validator to use {CILOGON_CERTS} endpoint, '
         f'refreshing keys every {CILOGON_KEY_REFRESH} HH:MM:SS')
jwt_validator = JWTValidator(CILOGON_CERTS,
                             timedelta(hours=CILOGON_KEY_REFRESH.hour, minutes=CILOGON_KEY_REFRESH.minute,
                                       seconds=CILOGON_KEY_REFRESH.second))

kid = CONFIG_OBJ.get_jwt_public_key_kid()
public_key = CONFIG_OBJ.get_jwt_public_key()
jwk_public_key_rsa = JWTManager.encode_public_jwk(public_key_file_name=public_key, kid=kid, alg="RS256")
fabric_jwks = {"keys": [jwk_public_key_rsa]}
