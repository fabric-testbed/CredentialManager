#!/usr/bin/env python3
"""`cors_error`: say what went wrong when that is safe, and stay quiet when it is not.

Every handler used to answer 500 "An internal error occurred. Please try again
or contact support." for anything raised. Most of what reaches them is not an
internal error at all - it is a deliberate validation message that the caller
needs and that was being replaced with an instruction to contact support.
"""
import base64
import json
import re

import pytest

from fabric_cm.credmgr.common.exceptions import OAuthCredMgrError
from fabric_cm.credmgr.external_apis.core_api import CoreApiError
from fabric_cm.credmgr.external_apis.litellm_api import LiteLLMApiError
from fabric_cm.credmgr.swagger_server.response.cors_response import cors_error


def body(response):
    return json.loads(bytes(response.body).decode())


def details(response):
    return body(response)["errors"][0]["details"]


class TestDeliberateErrors:
    """Raised on purpose: the message is the point, and the status is known."""

    def test_a_validation_message_reaches_the_caller(self):
        ex = OAuthCredMgrError("CredMgr: Token lifetime must be between 1 and 14", 400)
        r = cors_error(ex)
        assert r.status_code == 400
        assert details(r) == "CredMgr: Token lifetime must be between 1 and 14"

    def test_it_does_not_tell_the_user_to_contact_support(self):
        # The whole complaint: an actionable error became a dead end.
        r = cors_error(OAuthCredMgrError("CredMgr: Missing required parameter 'scope'!", 400))
        assert "contact support" not in details(r)

    @pytest.mark.parametrize("code", [400, 401, 403, 404])
    def test_the_status_the_exception_carries_is_honoured(self, code):
        # OAuthCredMgrError has always carried http_error_code; the handlers
        # discarded it and answered 500 regardless.
        assert cors_error(OAuthCredMgrError("nope", code)).status_code == code

    def test_an_unmapped_status_still_returns_the_message(self):
        r = cors_error(OAuthCredMgrError("teapot", 418))
        assert r.status_code == 500          # no helper for 418
        assert details(r) == "teapot"        # but the message survives


class TestUpstreamErrors:
    """An upstream failed. Not the caller's fault, and not our bug either."""

    def test_a_core_api_failure_is_a_bad_gateway_that_names_the_upstream(self):
        r = cors_error(CoreApiError("503 from uis"))
        assert r.status_code == 502
        assert "FABRIC Core API" in details(r)
        assert "503 from uis" in details(r)

    def test_a_litellm_failure_names_that_one_instead(self):
        r = cors_error(LiteLLMApiError("quota exceeded"))
        assert r.status_code == 502
        assert "LiteLLM" in details(r)

    def test_an_upstream_failure_is_not_reported_as_internal(self):
        # "Internal error" sends the user, and whoever they ask, to the wrong team.
        assert "internal error" not in details(cors_error(CoreApiError("boom"))).lower()


class TestUnexpectedErrors:
    """A real bug. The message may hold anything, so it stays in the log."""

    def test_the_message_is_withheld(self):
        leaky = RuntimeError("postgresql://credmgr:hunter2@db:5432/credmgr timed out")
        d = details(cors_error(leaky))
        assert "hunter2" not in d
        assert "postgresql" not in d
        assert cors_error(leaky).status_code == 500

    def test_a_reference_is_given_so_support_can_find_it(self):
        d = details(cors_error(RuntimeError("boom")))
        assert re.search(r"reference [0-9a-f]{8}", d), d

    def test_the_reference_in_the_response_is_the_one_logged(self):
        class Log:
            def __init__(self):
                self.lines = []

            def exception(self, msg):
                self.lines.append(msg)

            def info(self, msg):
                pass

            def error(self, msg):
                self.lines.append(msg)

        log = Log()
        d = details(cors_error(RuntimeError("boom"), log))
        ref = re.search(r"reference ([0-9a-f]{8})", d).group(1)
        # A reference nobody can look up is worse than none: it reads like a
        # promise that someone can find the failure.
        assert any(ref in line for line in log.lines), (ref, log.lines)

    def test_each_failure_gets_its_own_reference(self):
        a = details(cors_error(RuntimeError("one")))
        b = details(cors_error(RuntimeError("two")))
        assert a != b


class TestSecretsDoNotReachTheLog:
    """CodeQL py/clear-text-logging-sensitive-data, alert 13.

    Logs from this service are shipped by filebeat, so a credential reaching a
    log line does not stay on the host - it is indexed. The traceback has to be
    logged for the reference to be worth quoting, so the answer is to scrub it,
    not to stop logging.
    """

    class Log:
        def __init__(self):
            self.lines = []

        def error(self, msg):
            self.lines.append(msg)

        def exception(self, msg):
            self.lines.append(msg)

        def info(self, msg):
            self.lines.append(msg)

    def _logged(self, ex):
        log = self.Log()
        cors_error(ex, log)
        return "\n".join(log.lines)

    def raised(self, ex):
        """Raise and catch, so the exception carries a real traceback."""
        try:
            raise ex
        except type(ex) as caught:
            return caught

    def test_a_dsn_password_never_reaches_the_log(self):
        out = self._logged(self.raised(RuntimeError("could not connect to postgresql://credmgr:hunter2@db:5432/credmgr")))
        assert "hunter2" not in out

    def test_the_message_is_not_logged_at_all(self):
        # Not merely scrubbed. `format_exception` and `log.exception` both
        # append the message, and scrubbing is a heuristic that would miss a
        # bare secret. The class and the frames are logged instead - enough to
        # find the bug, with nothing the caller or an upstream controls.
        out = self._logged(self.raised(RuntimeError("postgresql://u:hunter2@db/x")))
        assert "hunter2" not in out
        assert "postgresql" not in out
        assert "RuntimeError" in out, "the exception class must still be there"
        assert "test_cors_error.py:" in out, "the frames must still be there"

    def test_a_bearer_token_never_reaches_the_log(self):
        # Assembled at runtime rather than written as a literal. A JWT-shaped
        # string in the source is picked up by secret scanning - it is not a
        # real credential, but an alert that is noise teaches people to dismiss
        # alerts, which is the opposite of what scanning is for.
        token = ".".join([
            base64.urlsafe_b64encode(b'{"alg":"RS256"}').decode().rstrip("="),
            "cGF5bG9hZA",
            "c2lnbmF0dXJl",
        ])
        out = self._logged(self.raised(RuntimeError(f"401 for Authorization: Bearer {token}")))
        assert token not in out
        assert token.split(".")[0] not in out, "the header segment leaked"

    def test_key_value_secrets_are_masked(self):
        for text, secret in [
            ("client_secret=s3cr3t-value&grant_type=refresh", "s3cr3t-value"),
            ('{"password": "letmein"}', "letmein"),
            ("api_key: abc123xyz", "abc123xyz"),
        ]:
            out = self._logged(self.raised(RuntimeError(text)))
            assert secret not in out, text

    def test_enough_survives_to_find_the_bug(self):
        # The message is gone, so what has to remain is the class and the place.
        out = self._logged(self.raised(RuntimeError("could not connect to postgresql://u:pw@db:5432/x")))
        assert "RuntimeError" in out
        # file:line in function, per frame - enough to locate the raise site.
        assert "test_cors_error.py:" in out
        assert " in raised" in out

    def test_an_upstream_error_is_scrubbed_before_it_reaches_the_caller(self):
        # This one goes into the response body, which is worse than a log.
        r = cors_error(CoreApiError("GET https://u:hunter2@uis.example/people failed"))
        assert "hunter2" not in details(r)

    def test_the_scrubber_still_masks_a_bearer_token_where_it_is_used(self):
        # It no longer runs over the message, but it still runs over the frames
        # and over upstream text that reaches the caller.
        from fabric_cm.credmgr.swagger_server.response.cors_response import scrub_secrets
        token = ".".join(["eyJ" + "0" * 12, "cGF5bG9hZA", "c2ln"])
        assert token not in scrub_secrets(f"Authorization: Bearer {token}")

    def test_scrubbing_leaves_ordinary_text_alone(self):
        from fabric_cm.credmgr.swagger_server.response.cors_response import scrub_secrets
        msg = "CredMgr: Token lifetime must be between 1 and 14"
        assert scrub_secrets(msg) == msg
