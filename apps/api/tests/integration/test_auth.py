import asyncio

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import ACCESS_COOKIE, REFRESH_COOKIE
from app.modules.identity.models import RefreshToken, UserRole
from tests.conftest import API, PASSWORD, create_user, login

pytestmark = pytest.mark.integration


async def test_register_creates_customer_and_never_returns_password(anon):
    response = await anon.post(
        f"{API}/auth/register",
        json={"full_name": "Ana Souza", "email": "Ana@Lux.dev", "password": PASSWORD, "phone": "+55 11 98888-7777"},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["email"] == "ana@lux.dev"
    assert body["role"] == "customer"
    assert "password" not in str(body) and "hashed" not in str(body)


async def test_register_cannot_escalate_role(anon):
    response = await anon.post(
        f"{API}/auth/register",
        json={"full_name": "Mallory", "email": "m@lux.dev", "password": PASSWORD, "role": "admin"},
    )
    assert response.status_code == 201
    assert response.json()["role"] == "customer"


async def test_register_duplicate_email_is_conflict(anon):
    await create_user(email="dup@lux.dev")
    response = await anon.post(
        f"{API}/auth/register", json={"full_name": "Dup", "email": "DUP@lux.dev", "password": PASSWORD}
    )
    assert response.status_code == 409
    assert response.json()["code"] == "email_taken"


async def test_register_weak_password_returns_field_errors(anon):
    response = await anon.post(
        f"{API}/auth/register", json={"full_name": "Ana", "email": "a@lux.dev", "password": "123"}
    )
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "validation_error"
    assert any(err["loc"][-1] == "password" for err in body["detail"])
    assert body["request_id"]


async def test_login_sets_httponly_cookies_scoped_by_path(anon):
    user = await create_user()
    response = await login(anon, user.email)
    cookies = response.headers.get_list("set-cookie")
    access = next(c for c in cookies if c.startswith(ACCESS_COOKIE))
    refresh = next(c for c in cookies if c.startswith(REFRESH_COOKIE))
    assert "HttpOnly" in access and "SameSite=strict" in access and "Path=/" in access
    assert f"Path={settings.API_PREFIX}/auth" in refresh
    assert response.json()["user"]["email"] == user.email
    me = await anon.get(f"{API}/auth/me")
    assert me.status_code == 200 and me.json()["id"] == user.id


async def test_login_error_does_not_reveal_whether_email_exists(anon):
    user = await create_user()
    wrong_password = await anon.post(f"{API}/auth/login", json={"email": user.email, "password": "Errada@12345"})
    unknown_email = await anon.post(f"{API}/auth/login", json={"email": "nobody@lux.dev", "password": "Errada@12345"})
    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json()["detail"] == unknown_email.json()["detail"]


async def test_inactive_user_cannot_login(anon):
    user = await create_user(active=False)
    response = await anon.post(f"{API}/auth/login", json={"email": user.email, "password": PASSWORD})
    assert response.status_code == 403
    assert response.json()["code"] == "user_inactive"


async def test_protected_route_without_token_is_401(anon):
    response = await anon.get(f"{API}/auth/me")
    assert response.status_code == 401
    assert response.json()["code"] == "not_authenticated"


async def test_bearer_token_flow_for_api_clients(anon):
    user = await create_user()
    token = await anon.post(f"{API}/auth/token", data={"username": user.email, "password": PASSWORD})
    assert token.status_code == 200
    anon.cookies.clear()
    me = await anon.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token.json()['access_token']}"})
    assert me.status_code == 200


async def test_refresh_rotates_the_refresh_token(customer):
    client, _ = customer
    old_refresh = client.cookies.get(REFRESH_COOKIE)
    response = await client.post(f"{API}/auth/refresh")
    assert response.status_code == 200
    assert client.cookies.get(REFRESH_COOKIE) != old_refresh
    assert (await client.get(f"{API}/auth/me")).status_code == 200


async def test_reused_refresh_token_revokes_the_whole_family(customer, make_client, monkeypatch):
    """Simulates a stolen refresh token: the thief and the user both end up logged out."""
    monkeypatch.setattr(settings, "REFRESH_REUSE_GRACE_SECONDS", 0)
    client, user = customer
    stolen = client.cookies.get(REFRESH_COOKIE)

    assert (await client.post(f"{API}/auth/refresh")).status_code == 200  # legit rotation

    attacker = await make_client()
    attacker.cookies.set(REFRESH_COOKIE, stolen, path=f"{settings.API_PREFIX}/auth")
    replay = await attacker.post(f"{API}/auth/refresh")
    assert replay.status_code == 401
    assert replay.json()["code"] == "refresh_token_reused"

    # The legitimate user's current refresh token died with the family.
    legit = await client.post(f"{API}/auth/refresh")
    assert legit.status_code == 401
    async with SessionLocal() as session:
        tokens = (await session.execute(select(RefreshToken).where(RefreshToken.user_id == user.id))).scalars().all()
    assert tokens and all(t.revoked_at is not None for t in tokens)


async def test_concurrent_refresh_from_two_tabs_does_not_log_the_user_out(customer, make_client):
    client, _ = customer
    old_refresh = client.cookies.get(REFRESH_COOKIE)
    other_tab = await make_client()
    other_tab.cookies.set(REFRESH_COOKIE, old_refresh, path=f"{settings.API_PREFIX}/auth")

    assert (await client.post(f"{API}/auth/refresh")).status_code == 200
    late = await other_tab.post(f"{API}/auth/refresh")
    assert late.status_code == 401
    assert late.json()["code"] == "refresh_token_rotated"
    # Within the grace window the family survives: the first tab keeps working.
    assert (await client.post(f"{API}/auth/refresh")).status_code == 200


async def test_logout_revokes_refresh_and_access_tokens(customer, make_client):
    client, _ = customer
    access = client.cookies.get(ACCESS_COOKIE)
    refresh = client.cookies.get(REFRESH_COOKIE)
    assert (await client.post(f"{API}/auth/logout")).status_code == 204

    replay = await make_client()
    replay.cookies.set(ACCESS_COOKIE, access)
    replay.cookies.set(REFRESH_COOKIE, refresh, path=f"{settings.API_PREFIX}/auth")
    me = await replay.get(f"{API}/auth/me")
    assert me.status_code == 401 and me.json()["code"] == "token_revoked"
    assert (await replay.post(f"{API}/auth/refresh")).status_code == 401


async def test_bootstrap_admin_works_exactly_once(anon, make_client):
    payload = {"full_name": "Root", "email": "root@lux.dev", "password": PASSWORD}
    headers = {"X-Bootstrap-Token": settings.BOOTSTRAP_ADMIN_TOKEN}
    other = await make_client()
    results = await asyncio.gather(
        anon.post(f"{API}/auth/bootstrap-admin", json=payload, headers=headers),
        other.post(f"{API}/auth/bootstrap-admin", json={**payload, "email": "root2@lux.dev"}, headers=headers),
    )
    # The advisory lock serialises the race: one creates the admin, the other gets 409.
    assert sorted(r.status_code for r in results) == [201, 409]
    created = next(r for r in results if r.status_code == 201).json()
    assert created["role"] == UserRole.ADMIN.value


async def test_bootstrap_admin_rejects_wrong_token(anon):
    response = await anon.post(
        f"{API}/auth/bootstrap-admin",
        json={"full_name": "Root", "email": "root@lux.dev", "password": PASSWORD},
        headers={"X-Bootstrap-Token": "x" * 40},
    )
    assert response.status_code == 403
