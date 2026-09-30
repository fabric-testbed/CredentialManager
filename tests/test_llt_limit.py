#!/usr/bin/env python3
"""The per project long lived token limit counts only tokens that are still usable.

Revoked tokens stayed in the table until they expired, and they counted towards
the limit, so a user who revoked five long lived tokens could not create another
one for up to nine weeks.
"""
from datetime import datetime, timedelta, timezone
from unittest import mock

import pytest

from fabric_cm.db.db_api import DbApi

# Importing the core package creates the schema, which needs a live database.
with mock.patch.object(DbApi, "create_db"):
    from fabric_cm.credmgr.core import oauth_credmgr
    from fabric_cm.credmgr.core.oauth_credmgr import OAuthCredMgr, OAuthCredMgrError, TokenState

LONG = timedelta(weeks=9)
SHORT = timedelta(hours=1)


class FakeDb:
    """Stands in for DB_OBJ, applying the same state filter and limit the real query does."""

    def __init__(self, rows):
        self.rows = rows

    def get_tokens(self, *, states=None, limit=5, expires=None, **kwargs):
        if expires is not None:
            return []
        rows = [dict(r) for r in self.rows if states is None or r["state"] in states]
        return rows if limit is None else rows[:limit]


def token(state: TokenState, lifetime: timedelta, age: timedelta = timedelta(days=1)) -> dict:
    created = datetime.now(timezone.utc) - age
    return {"token_hash": f"{state.name}-{lifetime}", "state": state.value,
            "created_at": created, "expires_at": created + lifetime}


@pytest.fixture
def credmgr():
    # Production values: a token is short lived up to one hour, and five long lived tokens are allowed.
    with mock.patch.object(OAuthCredMgr, "__init__", lambda self: None), \
            mock.patch.object(oauth_credmgr.CONFIG_OBJ, "get_token_life_time", return_value=3600), \
            mock.patch.object(oauth_credmgr.CONFIG_OBJ, "get_max_llt_per_project", return_value=5):
        yield OAuthCredMgr()


def active_count(credmgr, rows):
    with mock.patch.object(oauth_credmgr, "DB_OBJ", FakeDb(rows)):
        return len(credmgr.get_active_long_lived_tokens(project_id="p", user_email="u@example.org"))


def test_revoked_tokens_do_not_count(credmgr):
    assert active_count(credmgr, [token(TokenState.Revoked, LONG)] * 5) == 0


def test_short_lived_tokens_do_not_count(credmgr):
    assert active_count(credmgr, [token(TokenState.Valid, SHORT, age=timedelta(minutes=5))] * 5) == 0


def test_expired_tokens_do_not_count(credmgr):
    assert active_count(credmgr, [token(TokenState.Valid, LONG, age=LONG + timedelta(days=1))]) == 0


def test_usable_long_lived_tokens_count(credmgr):
    rows = [token(TokenState.Valid, LONG), token(TokenState.Nascent, LONG), token(TokenState.Refreshed, LONG)]
    assert active_count(credmgr, rows) == 3


def test_count_is_not_capped_by_the_default_page_size(credmgr):
    assert active_count(credmgr, [token(TokenState.Valid, LONG)] * 7) == 7


def test_create_is_allowed_after_revoking_five(credmgr):
    rows = [token(TokenState.Revoked, LONG)] * 5
    with mock.patch.object(oauth_credmgr, "DB_OBJ", FakeDb(rows)), \
            mock.patch.object(OAuthCredMgr, "_OAuthCredMgr__generate_token_and_save_info",
                              return_value={"id_token": "t"}) as generate:
        credmgr.create_token(project_id="p", project_name="n", scope="all", ci_logon_id_token="x",
                             refresh_token="r", remote_addr="1.2.3.4", user_email="u@example.org",
                             lifetime=LONG // timedelta(hours=1))
    generate.assert_called_once()


def test_create_is_refused_with_five_usable(credmgr):
    rows = [token(TokenState.Valid, LONG)] * 5
    with mock.patch.object(oauth_credmgr, "DB_OBJ", FakeDb(rows)):
        with pytest.raises(OAuthCredMgrError, match="already has 5 long lived tokens"):
            credmgr.create_token(project_id="p", project_name="n", scope="all", ci_logon_id_token="x",
                                 refresh_token="r", remote_addr="1.2.3.4", user_email="u@example.org",
                                 lifetime=LONG // timedelta(hours=1))
