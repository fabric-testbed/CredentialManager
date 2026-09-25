#!/usr/bin/env python3
"""`cors_error`: say what went wrong when that is safe, and stay quiet when it is not.

Every handler used to answer 500 "An internal error occurred. Please try again
or contact support." for anything raised. Most of what reaches them is not an
internal error at all - it is a deliberate validation message that the caller
needs and that was being replaced with an instruction to contact support.
"""
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
                pass

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
