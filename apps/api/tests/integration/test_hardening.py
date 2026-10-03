"""Regression tests for failure modes that only show up under concurrency, outages or hostile input.

Each test reproduces the original failure scenario: it failed before the fix and passes after.
"""

import asyncio
import base64
import json

import pytest

from app.core.config import settings
from app.core.database import engine
from app.core.redis import get_redis
from app.core.security import REFRESH_COOKIE
from app.modules.identity import service as identity_service
from app.modules.identity.repository import RefreshTokenRepository, UserRepository
from tests.conftest import API, PASSWORD, create_user, login

pytestmark = pytest.mark.integration


def _cursor(payload: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")


async def test_concurrent_wrong_passwords_cannot_beat_the_account_limit(make_client, monkeypatch):
    """Check-then-record let 30 concurrent guesses pass a limit of 3; the slot is now reserved atomically."""
    monkeypatch.setattr(settings, "LOGIN_MAX_ATTEMPTS_PER_ACCOUNT", 3)
    user = await create_user()
    clients = [await make_client() for _ in range(10)]
    responses = await asyncio.gather(
        *[c.post(f"{API}/auth/login", json={"email": user.email, "password": "Errada@12345"}) for c in clients]
    )
    statuses = sorted(r.status_code for r in responses)
    assert statuses.count(401) == 3, statuses
    assert statuses.count(429) == 7, statuses


async def test_login_does_not_hold_a_db_connection_during_bcrypt(anon, monkeypatch):
    """A burst of logins used to pin one pooled connection per request for ~200 ms of bcrypt."""
    user = await create_user()
    checked_out_during_bcrypt = []
    original = identity_service.verify_password

    async def spy(password, hashed):
        checked_out_during_bcrypt.append(engine.pool.checkedout())
        return await original(password, hashed)

    monkeypatch.setattr(identity_service, "verify_password", spy)
    response = await anon.post(f"{API}/auth/login", json={"email": user.email, "password": PASSWORD})
    assert response.status_code == 200
    assert checked_out_during_bcrypt == [0]


async def test_refresh_in_flight_does_not_survive_a_password_change(customer, make_client, monkeypatch):
    """Forced interleaving: refresh inserts its new token, pauses before commit, the password changes."""
    client, _ = customer
    stolen_device = await make_client()
    stolen_device.cookies.set(REFRESH_COOKIE, client.cookies.get(REFRESH_COOKIE), path=f"{settings.API_PREFIX}/auth")

    inserted, release = asyncio.Event(), asyncio.Event()
    original_add = RefreshTokenRepository.add

    async def paused_add(self, **kwargs):
        await original_add(self, **kwargs)
        inserted.set()
        await release.wait()

    monkeypatch.setattr(RefreshTokenRepository, "add", paused_add)
    refresh_task = asyncio.create_task(stolen_device.post(f"{API}/auth/refresh"))
    await asyncio.wait_for(inserted.wait(), 5)
    monkeypatch.setattr(RefreshTokenRepository, "add", original_add)

    change_task = asyncio.create_task(
        client.patch(
            f"{API}/users/me",
            json={"current_password": PASSWORD, "password": "Nova@Senha123", "password_confirm": "Nova@Senha123"},
        )
    )
    await asyncio.sleep(0.3)  # the password change is now waiting on the user's session lock
    assert not change_task.done()
    release.set()
    assert (await refresh_task).status_code == 200
    assert (await change_task).status_code == 200

    # The token minted by the in-flight refresh was revoked together with every other session.
    again = await stolen_device.post(f"{API}/auth/refresh")
    assert again.status_code == 401


async def test_deactivation_cannot_be_overwritten_by_a_stale_cache_write(admin, customer, monkeypatch):
    """A request that read 'active' before the deactivation must not re-cache it afterwards."""
    admin_client, _ = admin
    customer_client, customer_user = customer
    await get_redis().delete(identity_service._status_key(customer_user.id))

    original_status = UserRepository.status

    async def status_then_admin_deactivates(self, user_id):
        result = await original_status(self, user_id)  # reads "active"
        if user_id != customer_user.id:
            return result  # the admin's own requests also look up their status
        response = await admin_client.patch(f"{API}/users/{user_id}/deactivate")  # commits + invalidates
        assert response.status_code == 200
        return result  # the stale "active" is about to be cached

    monkeypatch.setattr(UserRepository, "status", status_then_admin_deactivates)
    await customer_client.get(f"{API}/auth/me")
    monkeypatch.setattr(UserRepository, "status", original_status)

    assert await get_redis().get(identity_service._status_key(customer_user.id)) is None
    me = await customer_client.get(f"{API}/auth/me")
    assert me.status_code == 401 and me.json()["code"] == "user_inactive"


async def test_auth_limiter_cannot_be_bypassed_with_a_crafted_host_header(anon, monkeypatch):
    monkeypatch.setattr(settings, "AUTH_RATE_LIMIT_MAX_ATTEMPTS", 2)
    statuses = []
    for i in range(4):
        response = await anon.post(
            f"{API}/auth/login",
            json={"email": "x@lux.dev", "password": "y"},
            headers={"Host": f"api.example/{i}"},
        )
        statuses.append(response.status_code)
    assert statuses[-1] == 429, statuses


@pytest.mark.parametrize(
    ("path", "payload"),
    [
        ("/products", {"id": "x"}),
        ("/products", {"id": [1]}),
        ("/products", {"id": 2**40}),
        ("/users", {"id": -1}),
        ("/orders", {"c": "not-a-date", "i": 1}),
        ("/orders", {"c": "2026-01-01T00:00:00", "i": 1}),  # naive datetime
        ("/orders", {"c": "2026-01-01T00:00:00+00:00", "i": 2**70}),
        ("/notifications", {"c": 5, "i": 1}),
    ],
)
async def test_tampered_cursors_are_400_not_500(admin, path, payload):
    client, _ = admin
    response = await client.get(f"{API}{path}", params={"cursor": _cursor(payload)})
    assert response.status_code == 400, response.text
    assert response.json()["code"] == "invalid_cursor"


async def test_bad_input_is_4xx_not_500(admin, customer, anon, make_client):
    admin_client, _ = admin
    customer_client, _ = customer

    short = await anon.post(f"{API}/auth/token", data={"username": "ab", "password": "x"})
    assert short.status_code == 422

    null_name = await customer_client.patch(f"{API}/users/me", json={"full_name": None})
    assert null_name.status_code == 400 and null_name.json()["code"] == "null_field"

    ancient = await admin_client.get(f"{API}/analytics/orders", params={"end_date": "0001-01-05"})
    assert ancient.status_code == 400

    other = await make_client()
    payload = {"full_name": "Corrida", "email": "corrida@lux.dev", "password": PASSWORD}
    results = await asyncio.gather(
        anon.post(f"{API}/auth/register", json=payload), other.post(f"{API}/auth/register", json=payload)
    )
    assert sorted(r.status_code for r in results) == [201, 409]


async def test_login_still_works_after_the_refactor(make_client):
    user = await create_user()
    client = await make_client()
    await login(client, user.email)
    assert (await client.get(f"{API}/auth/me")).status_code == 200
