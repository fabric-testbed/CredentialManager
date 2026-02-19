[![PyPI](https://img.shields.io/pypi/v/fabric-credmgr?style=plastic)](https://pypi.org/project/fabric-credmgr/)

# CredentialManager

 ## Table of Contents

 - [Overview](#overview)
 - [Requirements](#requirements)
 - [Architecture](#architecture)
 - [API Specification](#apispec)
   - [Version](#apiversion)
   - [Certs](#apicerts)
   - [Token Management](#apitokens)
   - [CLI Token Flow](#apicli)
   - [LLM Token Management](#apillm)
 - [Frontend (cm-app)](#frontend)
 - [Swagger Server](#swagger)
   - [Generate a new Server Stub](#generate)
 - [Usage](#usage)
   - [Configuration](#config)
   - [Deployment](#deploy)
   - [Validate Token Issued By Credential Manager](#validate)
 - [Logging](#logging)
   - [Filebeat Configuration](#filebeat)
   - [Logstash Filters](#logstash)
 - [Metrics](#metrics)
   - [Sample Output](#samples)
 - [API Examples](#examples)

## <a name="overview"></a>Overview
Fabric uses CILogon 2.0 and COmanage for Identity Authentication and Authorization management.
Fabric Credential Manager provides generation and refresh of credentials for Fabric users.
This package includes:
 - REST API server (Connexion/Flask) supporting token create/refresh/revoke operations
 - LLM token management via LiteLLM proxy integration for FABRIC AI services
 - CLI token flow for headless/remote token creation with browser-based authentication
 - React/Next.js frontend for managing tokens via a web interface
 - Uses Vouch-Proxy (with Nginx) to enable authentication using CILogon

Credential Manager can resolve roles directly from CoManage via LDAP queries or via the project registry. This is a configurable option.

 ![Component Diagram](./images/credmgr.png)

## <a name="requirements"></a>Requirements
- Python 3.9+
- Node.js 18+ (for frontend)

## <a name="architecture"></a>Architecture

### Backend (`fabric_cm/`)

- **`credmgr/swagger_server/`** — Connexion-based API server. OpenAPI 3.0.3 spec in `swagger/swagger.yaml` defines all endpoints. Controllers in `controllers/` handle routing; response logic lives in `response/`.
- **`credmgr/core/oauth_credmgr.py`** — Central business logic: OAuth2 token create/refresh/revoke, JWT generation, LDAP role resolution, CILogon integration, LLM key management.
- **`credmgr/config/config.py`** — ConfigParser-based config loaded from `/etc/credmgr/config`. Sections: runtime, oauth, ldap, jwt, core-api, vouch, database, llm.
- **`credmgr/external_apis/`** — LDAP role lookup (`ldap.py`), Core API project queries (`core_api.py`), and LiteLLM proxy integration (`litellm_api.py`).
- **`credmgr/token/token_encoder.py`** — JWT encoding/decoding with RSA key signing.
- **`db/db_api.py`** — SQLAlchemy ORM with PostgreSQL for token records.

### Frontend (`cm-app/`)

Next.js application with TypeScript, Tailwind CSS, and shadcn/ui components. See [Frontend](#frontend) section for details.

### Authentication Flow

Requests → Nginx (SSL termination) → Vouch-Proxy (OIDC with CILogon) → Credmgr API. Vouch sets a JWT cookie with user claims; Credmgr extracts these to generate FABRIC tokens.

### Docker Services

docker-compose.yml orchestrates: PostgreSQL, Nginx (reverse proxy), Credmgr API, cm-app (frontend), Vouch-Proxy.

## <a name="apispec"></a>API Specification

### <a name="apiversion"></a>Version

Resource | Action | Input | Output
:--------|:----:|:---:|:---:
`GET /version` | Get current API version | — | Version JSON

### <a name="apicerts"></a>Certs

Resource | Action | Input | Output
:--------|:----:|:---:|:---:
`GET /certs` | Get public JWKS keys for token signature verification | — | JWKS JSON

### <a name="apitokens"></a>Token Management

Resource | Action | Parameters | Output
:--------|:----:|:---:|:---:
`POST /tokens/create` | Create tokens | `project_id`, `project_name`, `scope` (default: all), `lifetime` (hours, max 1512, default 4), `comment` (10-100 chars) | Token JSON
`POST /tokens/refresh` | Refresh tokens | `project_id`, `project_name`, `scope`; body: refresh token | Token JSON
`POST /tokens/revoke` | Revoke a token | body: token object | —
`POST /tokens/revokes` | Revoke a token (alternate) | body: token object | —
`POST /tokens/validate` | Validate an identity token | body: token object | Decoded token
`GET /tokens` | List tokens for a user | `token_hash`, `project_id`, `expires`, `states` (Nascent/Valid/Refreshed/Revoked/Expired), `limit` (1-200), `offset` | Token list
`GET /tokens/revoke_list` | List revoked token hashes | `project_id` | Hash list
`DELETE /tokens` | Delete all user tokens | — | —
`DELETE /tokens/{token_hash}` | Delete specific token | path: `token_hash` | —

### <a name="apicli"></a>CLI Token Flow

Resource | Action | Parameters | Output
:--------|:----:|:---:|:---:
`GET /tokens/create_cli` | Create token via CLI browser flow | `project_id`, `project_name`, `scope`, `lifetime`, `comment`, `redirect_uri` (required, must be `http://localhost:PORT/...`) | 302 redirect or HTML delivery page

The CLI flow is a two-phase process:
1. **Phase 1** (not authenticated): Saves parameters in a cookie, redirects to Vouch/CILogon login. The redirect URL is built from the trusted `base-url` config value.
2. **Phase 2** (authenticated): Creates the token, serves an HTML page that attempts a JS fetch to the localhost `redirect_uri`. If the CLI is unreachable (remote VM), shows a copyable authorization code for manual paste.

### <a name="apillm"></a>LLM Token Management

Resource | Action | Parameters | Output
:--------|:----:|:---:|:---:
`POST /tokens/create_llm` | Create an LLM API key | `key_name` (max 100), `comment` (max 100), `duration` (days, 1-30, default 30), `models` (comma-separated model IDs) | Key JSON
`GET /tokens/llm_keys` | List LLM keys for a user | `limit` (1-200), `offset` | Key list
`GET /tokens/llm_models` | List available LLM models | — | Model list
`DELETE /tokens/delete_llm/{llm_key_id}` | Delete an LLM key | path: `llm_key_id` | —

LLM tokens are managed via LiteLLM proxy. Users must be members of the configured LLM project (default: `FABRIC-LLM`). The optional `models` parameter restricts the key to specific models; if omitted, the key has access to all available models.

## <a name="frontend"></a>Frontend (cm-app)

The frontend is a Next.js application located in `cm-app/`.

### FABRIC Tokens Page (`/`)
- Create tokens with project selection (only active projects shown), configurable lifetime, scope, and comment
- Token holders get extended lifetime limits (up to 9 weeks); non-holders limited to 4 hours
- List all tokens with state badges, click-to-copy token hashes
- Revoke tokens with confirmation dialog
- Copy or download created tokens
- Collapsible "Advanced" section for token validation

### LLM Tokens Page (`/llm`)
- Create LLM API keys with model selection (multi-select with "Select All"), duration, and optional name/comment
- Auto-generated configurations in tabbed view:
  - **API Key** tab — raw key for direct use
  - **Chatbox Config** tab — ready-to-use JSON config (copy or download)
  - **Claude Code Config** tab — `fabric-settings.json` (copy or download)
- List all LLM keys with spend tracking, budget limits, and expiration
- Delete keys with confirmation dialog
- Controlled by `featureFlags.llmTokens` in `cm-app/src/lib/config.ts` (currently disabled)

### Navigation
- **FABRIC Tokens** link — always visible when logged in
- **LLM Tokens** link — visible only when `featureFlags.llmTokens` is enabled

### Build Commands
```bash
cd cm-app
npm install        # install dependencies
npm run dev        # development server
npm run build      # production build
npm test           # run tests
```

## <a name="swagger"></a>Swagger Server
The swagger server was generated by the [swagger-codegen](https://github.com/swagger-api/swagger-codegen) project. By using the
[OpenAPI-Spec](https://github.com/swagger-api/swagger-core/wiki) from a remote server, you can easily generate a server stub.

Credmgr uses the [Connexion](https://github.com/zalando/connexion) library on top of Flask.


### <a name="generate"></a>Generate a new server stub
In a browser, go to [Swagger definition](https://app.swaggerhub.com/apis/kthare10/credmgr/1.0.2)

From the generate code icon (downward facing arrow), select Download API > JSON Resolved

A file named kthare10-credmgr-1.0.2-resolved.json should be downloaded. Rename it as openapi.json and copy it to CredentialManager/fabric/credmgr. Run the following command to generate the Flask based server.

```bash
$ cd fabric/credmgr/
$ cp kthare10-credmgr-1.0.2-resolved.json openapi.json
$ ./update_swagger_stub.sh
```

Remove existing swagger_server directory and move my_server/swagger_server to swagger_server after verifying all changes are as expected.

## <a name="usage"></a>Usage

### <a name="config"></a>Configuration

#### Nginx Config
No change is needed for development deployment, for production, enable password if Certs have one.
```
 server {
     listen 443 ssl http2;
     server_name $host;

     #ssl_password_file /etc/keys/fifo;
     ssl_certificate /etc/ssl/public.pem;
     ssl_certificate_key /etc/ssl/private.pem;
```

#### CILogon Client Registration
- To get started, register your client at https://cilogon.org/oauth2/register and wait for notice of approval. Please register your callback URLs on that page with care. They are the only callback URLs that may be used by your client unless you later contact help@cilogon.org and request a change to your registration.
- Upon completion the user will be issued a `CILOGON_CLIENT_ID` and `CILOGON_CLIENT_SECRET`.
NOTE: Callback url should match the url specified in Vouch Proxy Config

#### Vouch Config
Copy the `vouch/config_template` as `vouch/config`
Adjust the settings to suit your deployment environment
- `jwt.secret:` - must be changed - if using in production, it likely needs to be the same as on all other services, e.g. Project Registry
- `cookie.domain:` - your domain (default `127.0.0.1`)
- `cookie.name:` - your cookie name (default `fabric-service`)
- `oauth.client_id:` - CILogon Client ID (default `CILOGON_CLIENT_ID`)
- `oauth.client_secret:` - CILogon Client Secret (default `CILOGON_CLIENT_SECRET`)
- `oauth.callback_url:` - OIDC callback URL (default `https://127.0.0.1:8443/auth`)

#### Credmgr Config
Copy `config_template` file as `config`.
Adjust the settings to suit your deployment environment.

```
[runtime]
rest-port = 7000
prometheus-port = 8100
enable-core-api = True
enable-vouch-cookie = True
token-lifetime = 3600
# Public base URL of this credential manager instance (used for safe redirects in CLI token flow)
base-url = https://cm.fabric-testbed.net

[oauth]
oauth-client-id =
oauth-client-secret =

[vouch]
secret =
cookie-name = fabric-service
cookie-domain-name = cookie_domain

[core-api]
core-api-url = https://core-api.fabric-testbed.net/

[database]
db-user = fabric
db-password = fabric
db-name = credmgr
db-host = credmgr-db:5432

[llm]
llm-url = https://ai.fabric-testbed.net
llm-api-key = <MASTER_KEY>
llm-allowed-project = FABRIC-LLM
llm-team-id = <LLM_TEAM_ID>
llm-default-max-budget = 10.0
llm-default-duration = 30d
```

Environment-specific `base-url` values:
- **alpha**: `https://alpha-2.fabric-testbed.net`
- **beta**: `https://beta-2.fabric-testbed.net`
- **production**: `https://cm.fabric-testbed.net`

### <a name="deploy"></a>Deployment

Once the config file has been updated, bring up the containers. By default, self-signed certificates kept in ssl directory are used and referred in docker-compose.yml.
For production, signed certificates must be used.

```bash
# bring up via docker-compose
docker-compose up -d
```

### <a name="validate"></a>Validate Token issued by Credential Manager

FABRIC applications using Fabric Tokens issued by Credential Manager can validate the token against the Credential Manager Json Web Keys.
Below is a snippet of example python code for validating the tokens:
```python
from fss_utils.jwt_validate import JWTValidator

# Credential Manager JWKS Url
CREDMGR_CERTS = "https://cm.fabric-testbed.net/certs"

# Uses HH:MM:SS (less than 24 hours)
CREDMGR_KEY_REFRESH = "00:10:00"
t = datetime.strptime(CREDMGR_KEY_REFRESH, "%H:%M:%S")
jwt_validator = JWTValidator(CREDMGR_CERTS, timedelta(hours=t.hour, minutes=t.minute, seconds=t.second))

# Assumption that encoded_token variable contains the Fabric Token
code, e = jwt_validator.validate_jwt(encoded_token)
if code is not ValidateCode.VALID:
    print(f"Unable to validate provided token: {code}/{e}")
    raise e

decoded_token = jwt.decode(encoded_token, verify=False)
```

## <a name="logging"></a>Logging
Credential Manager logs can be sent to ELK using filebeat and logstash either directly or via Kafka.

### <a name="filebeat"></a>Filebeat Configuration
Filebeat inputs should be configured as follows for Credential Manager. Path should be updated as per the location on the system running Credential Manager.
```
filebeat.inputs:

# Each - is an input. Most options can be set at the input level, so
# you can use different inputs for various configurations.
# Below are the input specific configurations.

- type: log

  # Change to true to enable this input configuration.
  enabled: true

  # Paths that should be crawled and fetched. Glob based paths.
  paths:
    - /opt/CredentialManager/log/credmgr/*.log
```

Filebeat output for logstash
```
output.logstash:
  # The Logstash hosts
  hosts: ["logstash:5044"]

  username: "<username>"
  password: "<password>"

  ssl.certificate_authorities: ["/etc/pki/root/ca.crt"]
```

Filebeat output for kafka
```
output.kafka:
  hosts: ["kafka:9092"]
  topic: "credmgr"
  codec.json:
    pretty: false
```

### <a name="logstash"></a>Logstash Filters
Credential Manager requires following filters to be configured in logstash.
```
filter {
  grok {
        pattern_definitions => { "GREEDYMULTILINE" => "(.|\n)*"
                                 "SYSTIME" => "%{SYSLOGTIMESTAMP}%{SPACE}%{YEAR}" }
        match => {
          "message" => [
                          "%{TIMESTAMP_ISO8601:credmgr_log_timestamp}%{SPACE}-%{SPACE}%{NOTSPACE:credmgr_component}%{SPACE}-%{SPACE}%{NOTSPACE:credmgr_location}%{SPACE}-%{SPACE}%{NOTSPACE:credmgr_log_level}%{SPACE}-%{SPACE}%{GREEDYMULTILINE:credmgr_log_message}",
                       ]
        }
      }
  }
```
Logstash input:
```
  beats {
    port => 5000
  }
   kafka {
            bootstrap_servers => "kafka:9092"
            topics => ["credmgr"]
            codec => json
    }
```

## <a name="metrics"></a>Metrics
Credential Manager is integrated to following metrics collected by Prometheus.
User can view the metrics by `https://<host>/metrics` once the container is running.
- Requests_Received : HTTP Requests received
- Requests_Success : HTTP Requests processed successfully
- Requests_Failed : HTTP Requests failed

### <a name="samples"></a>Sample output
```
# HELP Requests_Received_total HTTP Requests
# TYPE Requests_Received_total counter
Requests_Received_total{endpoint="/certs",method="get"} 1.0
Requests_Received_total{endpoint="/tokens/create",method="post"} 4.0
# HELP Requests_Success_total HTTP Success
# TYPE Requests_Success_total counter
Requests_Success_total{endpoint="/certs",method="get"} 1.0
# HELP Requests_Failed_total HTTP Failures
# TYPE Requests_Failed_total counter
Requests_Failed_total{endpoint="/tokens/create",method="post"} 2.0
```

## <a name="examples"></a>API Examples

### Create Token
```bash
curl -X POST -i "https://<host>/tokens/create?project_id=<uuid>&scope=all&lifetime=4&comment=Create+Token+via+CLI" \
  -H "accept: application/json"
```

### Revoke Token
```bash
curl -X POST -i "https://<host>/tokens/revoke" \
  -H "accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{"type": "refresh_token", "token": "<refresh_token_value>"}'
```

### Create LLM Key (restricted to specific models)
```bash
curl -X POST -i "https://<host>/tokens/create_llm?key_name=my-key&duration=30&models=claude-sonnet,gpt-4" \
  -H "accept: application/json"
```

### CLI Token Flow
```bash
# Open in browser — will redirect through CILogon login, then deliver token to localhost callback
open "https://<host>/credmgr/tokens/create_cli?redirect_uri=http://localhost:12345/callback&scope=all&lifetime=4"
```
