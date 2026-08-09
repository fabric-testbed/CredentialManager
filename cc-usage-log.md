# Claude Code Usage Log

## Session: 2026-05-18 12:00

- **Project**: CredentialManager
- **Task summary**: Upgraded Next.js from 16.1.6 to 16.2.6 to fix multiple high-severity CVEs; updated Create Subvolume pane to list all non-service projects (paginated) for facility operators; fixed CephX Caps dropdown not showing newly created project subvolumes by refreshing groups after create/delete.
- **Workflow stage**: coding, debugging
- **Prompts**: 7
- **Tool calls**: 42
- **Agent tasks**: 2 (Explore storage tab code, search Core API schema)
- **Models used**: Opus 4.6
- **Estimated cost (USD)**: ~$3.50
- **Input tokens**: ~150,000
- **Output tokens**: ~8,000
- **Files created**: 1 (cc-usage-log.md)
- **Files modified**: 3 (cm-app/package.json, cm-app/src/services/core-api-service.ts, cm-app/src/app/storage/page.tsx)
- **Key decisions / milestones**:
  - Upgraded next.js to 16.2.6 (latest) instead of minimum 16.1.7 patch per user preference
  - Added paginated `getAllProjectsPaginated()` to fetch all projects for operators per user preference
  - Excluded service projects (`project_type !== "service"`) from Create Subvolume project dropdown
  - Fixed CephX Caps subvolume dropdown by refreshing groups after subvolume create/delete
  - Created PR #81: https://github.com/fabric-testbed/CredentialManager/pull/81

## Session: 2026-05-26 16:35

- **Project**: CredentialManager
- **Task summary**: Increased Core API project query limit from 50 to 200 and fixed pagination offset bug in `core_api.py`. Created branch, GPG-signed commit, pushed, and opened PR #82.
- **Workflow stage**: coding, deployment
- **Prompts**: 3
- **Tool calls**: 14
- **Agent tasks**: 0
- **Models used**: Opus 4.6
- **Estimated cost (USD)**: ~$1.00
- **Input tokens**: ~50,000
- **Output tokens**: ~3,000
- **Files created**: 0
- **Files modified**: 1 (fabric_cm/credmgr/external_apis/core_api.py)
- **Key decisions / milestones**:
  - Changed default limit from 50 to 200 to fetch most users' projects in a single request
  - Fixed pagination bug: `limit += limit` (doubling limit) replaced with `offset += size` (correct offset advancement)
  - Confirmed no other API calls in core_api.py need limit updates (whoami, people, project-by-id are all single-record lookups)
  - Created PR #82: https://github.com/fabric-testbed/CredentialManager/pull/82

## Session: 2026-05-31 18:50

- **Project**: CredentialManager
- **Task summary**: Added JWT scope derived from project_type (service/resource), added input validation and base64 encoding for CLI cookie params (CodeQL fix), added /credmgr router prefix, increased nginx proxy buffers, fixed CSRF check to allow CORS origins and valid vouch cookies, temporarily disabled CSRF check to unblock portal.
- **Workflow stage**: coding, debugging, deployment
- **Prompts**: 12
- **Tool calls**: ~55
- **Agent tasks**: 0
- **Models used**: Opus 4.6
- **Estimated cost (USD)**: ~$5.00
- **Input tokens**: ~250,000
- **Output tokens**: ~12,000
- **Files created**: 0
- **Files modified**: 6 (core_api.py, token_encoder.py, tokens_controller.py, app.py, dependencies.py, nginx.conf, config_template)
- **Key decisions / milestones**:
  - JWT scope now set to "service" or "resource" based on project_type from Core API (replaces static "all")
  - Added project_type to project dict passed through from Core API
  - Added allowlist regex validation for CLI params before cookie storage
  - Base64-encoded CLI params cookie to break CodeQL py/cookie-injection taint chain
  - Added /credmgr prefix to FastAPI router to match OpenAPI spec base path
  - Added proxy_buffer_size/proxy_buffers/proxy_busy_buffers_size (32k) to nginx.conf
  - CSRF check expanded to allow CORS allowed origins + valid vouch cookies
  - CSRF check temporarily disabled to unblock portal requests
  - Added https://portal.fabric-testbed.net to config_template cors-allowed-origins

## Session: 2026-06-01 19:15

- **Project**: CredentialManager
- **Task summary**: Fixed SQLAlchemy connection pool exhaustion in DbApi by replacing broken per-thread scoped_session pattern with a single shared registry, adding finally: Session.remove() to all methods, and configuring engine pool settings.
- **Workflow stage**: coding, deployment
- **Prompts**: 3
- **Tool calls**: 17
- **Agent tasks**: 0
- **Models used**: Opus 4.6
- **Estimated cost (USD)**: ~$1.50
- **Input tokens**: ~80,000
- **Output tokens**: ~5,000
- **Files created**: 0
- **Files modified**: 1 (fabric_cm/db/db_api.py)
- **Key decisions / milestones**:
  - Replaced per-thread self.sessions dict with single self.Session = scoped_session(...) registry
  - Added finally: self.remove_session() to all 8 DbApi methods (reset_db, add_token, update_token, remove_token, get_tokens, add_llm_key, get_llm_keys, remove_llm_key)
  - Configured engine: pool_size=10, max_overflow=20, pool_pre_ping=True, pool_recycle=3600
  - Removed unused threading import
  - GPG-signed commit c18ffe4, pushed to fix/security-vulnerabilities

## Session: 2026-06-02 18:30

- **Project**: CredentialManager
- **Task summary**: Diagnosed widespread token refresh and orchestrator revoke-list 500 errors. Root cause: CILogon rejecting consumed/expired refresh tokens, caught as CustomOAuth2Error and returned as misleading 500. Fixed to return 401 with actionable message. Also confirmed DB pool exhaustion fix (c18ffe4) resolved revoke-list 500s.
- **Workflow stage**: debugging, coding, deployment
- **Prompts**: 3
- **Tool calls**: ~25
- **Agent tasks**: 1 (Explore token refresh error path)
- **Models used**: Opus 4.6
- **Estimated cost (USD)**: ~$4.00
- **Input tokens**: ~200,000
- **Output tokens**: ~10,000
- **Files created**: 0
- **Files modified**: 1 (fabric_cm/credmgr/swagger_server/response/tokens_controller.py)
- **Key decisions / milestones**:
  - Analyzed credmgr.log from cm.fabric-testbed.net — confirmed CILogon `invalid_token` / `token not found` as root cause of refresh failures
  - Analyzed ControlFramework orchestrator logs — revoke-list 500 was separate DB pool exhaustion issue (already fixed)
  - Changed CustomOAuth2Error handling: `invalid_token` and `invalid_grant` now return 401 instead of 500
  - Added cors_401 import to tokens_controller.py
  - Commit cc86d07 pushed to fix/security-vulnerabilities

## Session: 2026-06-10 11:25

- **Project**: CredentialManager (/Users/kthare10/claude-cf/CredentialManager)
- **Task summary**: Investigated how bastion usernames are populated in the Storage tab's Create Subvolume dropdown. Traced the pipeline from cm-app (Next.js) through the /api/storage proxy to fabric_ceph's list_project_members and the FABRIC core-api source, identifying three drop points that explain missing bastion logins.
- **Workflow stage**: debugging / code investigation
- **Prompts**: 3
- **Tool calls**: ~34 (greps, file reads, shallow clone of fabric-core-api for source inspection)
- **Agent tasks**: 0
- **Models used**: Fable 5
- **Estimated cost (USD)**: not available (exact token usage not exposed in session)
- **Input tokens**: not available
- **Output tokens**: not available
- **Files created**: 0
- **Files modified**: 1 (cc-usage-log.md — this entry)
- **Key decisions / milestones**:
  - Dropdown source: fabric_ceph `/project/members` → Core API `/core-api-metrics/events/projects-membership/{service_project}` → per-person `/core-api-metrics/people-details/{uuid}`.
  - Found 3 silent drop points: (1) membership is event-log-derived (CoreApiEvents replay), missing pre-event-logging members; (2) members with NULL bastion_login dropped in `_fetch_member`; (3) get_user_info failures skipped with only a warning (nondeterministic gaps).
  - Proposed fix: replace N people-details calls with a single `/core-api-metrics/people` bulk call intersected with membership UUIDs (not yet implemented).

## Session: 2026-07-13 11:37

- **Project**: CredentialManager (/Users/kthare10/claude-cf/CredentialManager)
- **Task summary**: Made LiteLLM key names unique per user instead of globally: namespaced the LiteLLM key_alias with the user UUID, stored the user-facing name in key metadata, added a per-user duplicate-name check returning 400, and restored friendly names when listing keys. Created branch, GPG-signed commit, and opened PR #85.
- **Workflow stage**: coding, testing, deployment
- **Prompts**: 4
- **Tool calls**: ~62 (greps, file reads, edits, mocked test runs, git/gh operations)
- **Agent tasks**: 0
- **Models used**: Fable 5
- **Estimated cost (USD)**: not available (exact token usage not exposed in session)
- **Input tokens**: not available
- **Output tokens**: not available
- **Files created**: 0 in project (2 throwaway test scripts in session scratchpad)
- **Files modified**: 2 (fabric_cm/credmgr/core/oauth_credmgr.py, fabric_cm/credmgr/swagger_server/response/tokens_controller.py)
- **Key decisions / milestones**:
  - Root cause: LiteLLM enforces key_alias uniqueness globally; passing key_name directly as alias blocked cross-user name reuse
  - New keys use alias `{key_name}-{user_uuid}`; user-chosen name kept in metadata.key_name and restored via `_llm_key_display_name` on listing (legacy raw-alias keys handled via fallback)
  - Same-user duplicate names rejected with 400 and clear message; controller now surfaces OAuthCredMgrError BAD_REQUEST as cors_400 instead of generic 500
  - Verified with mocked end-to-end test (fake LiteLLM proxy enforcing global alias constraint) — 6 scenarios pass; repo pytest suite fails at collection independent of this change (test config missing `log-size` in `[logging]`)
  - Discovered fix/security-vulnerabilities was already merged via PR #84 (stale remote-tracking ref); based PR on master and deleted the merged local branch
  - Created PR #85: https://github.com/fabric-testbed/CredentialManager/pull/85 (branch fix/llm-key-name-per-user-uniqueness, GPG-signed commit 7e55647)
