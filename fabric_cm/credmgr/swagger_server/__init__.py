from datetime import timedelta

from fss_utils.jwt_manager import JWTManager, ValidateCode
from fss_utils.jwt_validate import JWTValidator
import prometheus_client

from fabric_cm.credmgr.config import CONFIG_OBJ
from fabric_cm.credmgr.logging import LOG

received_counter = prometheus_client.Counter('Requests_Received', 'HTTP Requests', ['method', 'endpoint'])
success_counter = prometheus_client.Counter('Requests_Success', 'HTTP Success', ['method', 'endpoint'])
failure_counter = prometheus_client.Counter('Requests_Failed', 'HTTP Failures', ['method', 'endpoint'])

# initialize CI Logon Token Validation
CILOGON_CERTS = CONFIG_OBJ.get_oauth_jwks_url()
CILOGON_KEY_REFRESH = CONFIG_OBJ.get_oauth_key_refresh()
LOG.info(f'Initializing JWT Validator to use {CILOGON_CERTS} endpoint, '
         f'refreshing keys every {CILOGON_KEY_REFRESH} HH:MM:SS')
jwt_validator = JWTValidator(url=CILOGON_CERTS,
                             refresh_period=timedelta(hours=CILOGON_KEY_REFRESH.hour,
                                                      minutes=CILOGON_KEY_REFRESH.minute,
                                                      seconds=CILOGON_KEY_REFRESH.second),
                             audience=CONFIG_OBJ.get_oauth_client_id())

kid = CONFIG_OBJ.get_jwt_public_key_kid()
public_key = CONFIG_OBJ.get_jwt_public_key()
code, jwk_public_key_rsa = JWTManager.encode_jwk(key_file_name=public_key, kid=kid, alg="RS256")
if code != ValidateCode.VALID:
    LOG.error("Failed to encode JWK")
    raise jwk_public_key_rsa

fabric_jwks = {"keys": [jwk_public_key_rsa]}
