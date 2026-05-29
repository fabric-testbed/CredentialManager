# Security Audit Report — FABRIC Credential Manager

**Date**: 2026-05-29
**Total Issues Found**: 38 (6 Critical, 8 High, 10 Medium, 14 Low)
**Fixed**: 38 | **Remaining**: 0

---

## Already Fixed (Issues 1–6)

| # | Severity | Issue | File(s) |
|---|----------|-------|---------|
| 1 | Critical | LDAP Injection — user inputs concatenated into LDAP filters | `fabric_cm/credmgr/external_apis/ldap.py` |
| 2 | Critical | CORS Origin Reflection — request Origin echoed without validation | `fabric_cm/credmgr/swagger_server/response/cors_response.py`, `config.py`, `config_template` |
| 3 | High | Error Message Information Disclosure — `str(ex)` returned in 500 responses | `tokens_controller.py`, `default_controller.py` |
| 4 | Medium | Missing Backend Comment Validation — no length check on comment param | `tokens_controller.py` |
| 5 | Medium | Nginx `/metrics` Publicly Accessible — no IP restriction | `nginx/default.conf` |
| 6 | Medium | Missing Nginx Security Headers — no HSTS, X-Frame-Options, etc. | `nginx/default.conf` |

---

## Remaining Issues (7–38)

### CRITICAL

#### 7. Sensitive Token Logging — Refresh Tokens Logged at DEBUG Level
- **File**: `fabric_cm/credmgr/core/oauth_credmgr.py`, lines 320, 334
- **Description**: `refresh_token()` logs incoming and new refresh tokens at debug level. If log files are accessed by unauthorized parties, these tokens can impersonate users.

#### 8. Sensitive Token Logging — CILogon ID Token Logged at DEBUG Level
- **File**: `fabric_cm/credmgr/core/oauth_credmgr.py`, line 165
- **Description**: The full CILogon identity token JWT is logged via `self.log.debug("CILogon Token: %s", ci_logon_id_token)`.

#### 9. Refresh Token Leaked in Error String
- **File**: `fabric_cm/credmgr/core/oauth_credmgr.py`, lines 346–349
- **Description**: When token generation fails after a successful refresh, the new refresh token is embedded in the exception message:
  ```python
  error_string = f"error: {exception_string}, {self.REFRESH_TOKEN}: {new_refresh_token}"
  ```
  While error messages are now sanitized at the controller layer, this is a defense-in-depth concern.

#### 10. Vouch Cookie Secret Hardcoded in Template
- **File**: `vouch/config_template`, line 39
- **Description**: A real base64 secret value `kmDDgMLGThapDV1QnhWPJd0oARzjLa5Zy3bQ8WfOIYk=` is present. If deployed without changing it, attackers can forge vouch cookies.

---

### HIGH

#### 11. Default Database Credentials in Templates
- **File**: `config_template`, lines 107–110; `env.template`, lines 4–5
- **Description**: Default PostgreSQL credentials `fabric/fabric` are present in both files.

#### 12. SSL Verification Disabled for Core API
- **File**: `config_template`, line 95; `fabric_cm/credmgr/external_apis/core_api.py`, lines 111, 130, 146, 171
- **Description**: `ssl_verify = False` disables TLS certificate validation for all Core API communications, enabling man-in-the-middle attacks.

#### 13. Vouch Cookie Secure Flag Set to False
- **File**: `vouch/config_template`, line 43
- **Description**: `secure: false` allows the authentication cookie to be sent over unencrypted HTTP.

#### 14. No Rate Limiting on Token Endpoints
- **Files**: `tokens_controller.py` (all endpoints), `nginx/default.conf`
- **Description**: No rate limiting anywhere in the stack. An authenticated attacker could generate thousands of tokens rapidly, causing resource exhaustion.

#### 15. Backend Dockerfile Runs as Root
- **File**: `Dockerfile`
- **Description**: No non-root user is created. The application runs as root, increasing blast radius if compromised.

#### 16. CLI Params Cookie Missing `secure=True`
- **File**: `fabric_cm/credmgr/swagger_server/response/tokens_controller.py`, line 478
- **Description**: The `fabric_cli_params` cookie is set without `secure=True`:
  ```python
  resp.set_cookie(COOKIE_NAME, cli_params, max_age=600, httponly=True, samesite='Lax')
  ```

#### 17. Nginx CORS Preflight Returns Wildcard Origin
- **File**: `nginx/default.conf`, lines 117–131
- **Description**: The OPTIONS handler returns `Access-Control-Allow-Origin: '*'` with `Access-Control-Allow-Credentials: true`. Should be aligned with the backend's origin allowlist.

#### 18. Nginx Exposes Sensitive Tokens in Response Headers
- **File**: `nginx/default.conf`, lines 194, 211–213, 216
- **Description**: The `location /` block adds IdToken, AccessToken, RefreshToken, and the full Cookie as response headers:
  ```nginx
  add_header X-Vouch-IdP-IdToken $auth_resp_x_vouch_idp_idtoken;
  add_header X-Vouch-IdP-AccessToken $auth_resp_x_vouch_idp_accesstoken;
  add_header X-Vouch-IdP-RefreshToken $auth_resp_x_vouch_idp_refreshtoken;
  add_header Cookie $http_cookie;
  ```
  These are visible to JavaScript, browser dev tools, and intermediary proxies.

---

### MEDIUM

#### 19. Vouch Cookie Decoded Without Signature Verification
- **File**: `fabric_cm/credmgr/swagger_server/response/decorators.py`, line 81
- **Description**: `verify=False` when decoding the vouch cookie JWT. Any properly structured JWT would be accepted.

#### 20. CILogon ID Token Decoded Without Signature Verification (Cookie Path)
- **File**: `fabric_cm/credmgr/swagger_server/response/decorators.py`, line 94; `fabric_cm/credmgr/core/oauth_credmgr.py`, line 174
- **Description**: `options={"verify_signature": False}` when decoding the CILogon ID token extracted from a vouch cookie.

#### 21. Production Log Level Set to DEBUG in Template
- **File**: `config_template`, line 61
- **Description**: `log-level = DEBUG` causes sensitive data to be written to log files in production.

#### 22. No Input Validation on `token_hash` Parameter
- **File**: `fabric_cm/credmgr/swagger_server/response/tokens_controller.py`, lines 130–160
- **Description**: `token_hash` is not validated as a hex string of expected length before database queries.

#### 23. No Input Validation on `llm_key_id` Parameter
- **File**: `fabric_cm/credmgr/swagger_server/response/tokens_controller.py`, line 667
- **Description**: `llm_key_id` is passed directly to the LiteLLM API and database without format validation.

#### 24. No `limit`/`offset` Bounds Validation
- **File**: `fabric_cm/credmgr/swagger_server/response/tokens_controller.py`, lines 281, 704; `fabric_cm/db/db_api.py`, lines 145, 233
- **Description**: `limit` and `offset` are passed directly to SQLAlchemy without bounds checking. Extremely large values could cause memory exhaustion.

#### 25. Database Connection String Built by String Formatting
- **File**: `fabric_cm/db/db_api.py`, line 42
- **Description**: Uses `"postgresql+psycopg2://{}:{}@{}/{}".format(...)` instead of `sqlalchemy.engine.URL.create()`. Special characters in password could malform the connection string.

#### 26. No CSRF Protection on State-Changing Endpoints
- **File**: `fabric_cm/credmgr/swagger_server/response/tokens_controller.py` (all POST/DELETE)
- **Description**: No CSRF tokens. Token create/revoke/delete rely solely on the vouch cookie, making cross-site request forgery possible.

#### 27. SSRF via Storage API Proxy
- **File**: `cm-app/src/app/api/storage/[...path]/route.ts`, lines 11–13
- **Description**: The storage API proxy constructs a target URL from the request path without path allowlisting. Path traversal patterns could access other endpoints.

#### 28. Frontend Missing `encodeURIComponent` on Query Parameters
- **File**: `cm-app/src/services/credential-manager-service.ts`, lines 14–24
- **Description**: `createIdToken` builds URLs without encoding `comment` and other parameters. A comment containing `&` or `=` corrupts the URL structure.

---

### LOW

#### 29. Vouch `publicAccess: true` in Config Template
- **File**: `vouch/config_template`, line 22
- **Description**: Combined with `allowAllUsers: true`, any CILogon user can access the system with no domain restriction at the vouch level.

#### 30. Missing `Content-Security-Policy` Header
- **File**: `nginx/default.conf`
- **Description**: No CSP header to mitigate XSS and data exfiltration.

#### 31. Missing `X-XSS-Protection` Header
- **File**: `nginx/default.conf`
- **Description**: Not set. Older browsers benefit from `X-XSS-Protection: 1; mode=block`.

#### 32. Missing `Permissions-Policy` Header
- **File**: `nginx/default.conf`
- **Description**: No `Permissions-Policy` header to restrict browser API access (camera, mic, geolocation).

#### 33. No `server_tokens off` Directive
- **File**: `nginx/nginx.conf`
- **Description**: Nginx version exposed in response headers and error pages.

#### 34. Frontend Uses `localStorage` for User State
- **File**: `cm-app/src/hooks/use-user-status.ts`, lines 43–44; `cm-app/src/services/http-service.ts`, lines 8, 13–14
- **Description**: `cmUserStatus` and `cmUserID` stored in localStorage, accessible to any JavaScript on the same origin.

#### 35. `_validate_localhost_redirect` Allows Any Port
- **File**: `fabric_cm/credmgr/swagger_server/response/tokens_controller.py`, lines 390–406
- **Description**: Redirect validation permits any port on localhost. Could be used to probe internal services (e.g., Redis on 6379).

#### 36. JWT `alg` Not Pinned in Token Validation
- **File**: `fabric_cm/credmgr/core/oauth_credmgr.py`, lines 789, 808
- **Description**: Algorithm is read from the unverified token header rather than pinned to `RS256`:
  ```python
  alg = jwt.get_unverified_header(token).get('alg', None)
  claims = jwt.decode(token, key=key, algorithms=[alg], ...)
  ```

#### 37. cm-app Dockerfile Runs as Root
- **File**: `cm-app/Dockerfile`
- **Description**: Frontend container runs Node.js as root.

#### 38. Vouch Proxy Log Level Set to Debug
- **File**: `vouch/config_template`, line 5
- **Description**: `logLevel: debug` causes authentication details to be logged by vouch-proxy.

---

## Summary by Severity

| Severity | Total | Fixed | Remaining |
|----------|-------|-------|-----------|
| Critical | 6 | 2 | 4 |
| High | 8 | 1 | 7 |
| Medium | 10 | 3 | 7 |
| Low | 14 | 0 | 14 |
| **Total** | **38** | **6** | **32** |
