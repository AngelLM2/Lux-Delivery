import pytest

from tests.conftest import API, PASSWORD, create_user, login

pytestmark = pytest.mark.integration


async def test_customer_cannot_list_users(customer):
    client, _ = customer
    response = await client.get(f"{API}/users")
    assert response.status_code == 403


async def test_admin_lists_users_with_keyset_pagination(admin):
    client, _ = admin
    for i in range(5):
        await create_user(email=f"u{i}@lux.test")
    first = (await client.get(f"{API}/users", params={"limit": 4})).json()
    assert len(first["items"]) == 4 and first["next_cursor"]
    second = (await client.get(f"{API}/users", params={"limit": 4, "cursor": first["next_cursor"]})).json()
    ids = [u["id"] for u in first["items"] + second["items"]]
    assert len(ids) == len(set(ids)) == 6  # 5 customers + the admin, no duplicates across pages
    assert second["next_cursor"] is None


async def test_admin_filters_users_by_role_and_search(admin):
    client, _ = admin
    await create_user(email="maria.lima@lux.test")
    by_search = (await client.get(f"{API}/users", params={"q": "maria"})).json()["items"]
    assert [u["email"] for u in by_search] == ["maria.lima@lux.test"]
    admins = (await client.get(f"{API}/users", params={"role": "admin"})).json()["items"]
    assert all(u["role"] == "admin" for u in admins) and len(admins) == 1


async def test_deactivation_takes_effect_immediately(admin, customer):
    admin_client, _ = admin
    customer_client, customer_user = customer
    assert (await customer_client.get(f"{API}/auth/me")).status_code == 200  # warms the status cache

    response = await admin_client.patch(f"{API}/users/{customer_user.id}/deactivate")
    assert response.status_code == 200 and response.json()["is_active"] is False

    # Same still-valid JWT, but the cached status was invalidated: access is cut now, not in 15 min.
    me = await customer_client.get(f"{API}/auth/me")
    assert me.status_code == 401 and me.json()["code"] == "user_inactive"
    assert (await customer_client.post(f"{API}/auth/refresh")).status_code == 401

    assert (await admin_client.patch(f"{API}/users/{customer_user.id}/activate")).status_code == 200
    assert (
        await customer_client.post(f"{API}/auth/login", json={"email": customer_user.email, "password": PASSWORD})
    ).status_code == 200


async def test_admin_cannot_deactivate_self_or_other_admins(admin):
    client, me = admin
    other_admin = await create_user(role=me.role)
    assert (await client.patch(f"{API}/users/{me.id}/deactivate")).json()["code"] == "cannot_deactivate_self"
    assert (await client.patch(f"{API}/users/{other_admin.id}/deactivate")).json()["code"] == "cannot_deactivate_admin"


async def test_admin_creates_user_with_role(admin, make_client):
    client, _ = admin
    response = await client.post(
        f"{API}/users", json={"full_name": "Gerente", "email": "gerente@lux.dev", "password": PASSWORD, "role": "admin"}
    )
    assert response.status_code == 201 and response.json()["role"] == "admin"
    new_client = await make_client()
    await login(new_client, "gerente@lux.dev")
    assert (await new_client.get(f"{API}/users")).status_code == 200


async def test_update_profile(customer):
    client, _ = customer
    response = await client.patch(f"{API}/users/me", json={"full_name": "Novo Nome", "phone": "+55 11 91234-5678"})
    assert response.status_code == 200
    assert response.json()["full_name"] == "Novo Nome"
    assert (await client.patch(f"{API}/users/me", json={})).status_code == 400


async def test_phone_must_be_unique(customer, other_customer):
    client, _ = customer
    other, _ = other_customer
    assert (await client.patch(f"{API}/users/me", json={"phone": "+55 11 90000-0001"})).status_code == 200
    conflict = await other.patch(f"{API}/users/me", json={"phone": "+55 11 90000-0001"})
    assert conflict.status_code == 409 and conflict.json()["code"] == "phone_taken"


async def test_password_change_requires_current_password_and_ends_other_sessions(customer, make_client):
    client, user = customer
    second_device = await make_client()
    await login(second_device, user.email)

    wrong = await client.patch(
        f"{API}/users/me",
        json={"current_password": "Errada@12345", "password": "Nova@Senha123", "password_confirm": "Nova@Senha123"},
    )
    assert wrong.status_code == 403

    ok = await client.patch(
        f"{API}/users/me",
        json={"current_password": PASSWORD, "password": "Nova@Senha123", "password_confirm": "Nova@Senha123"},
    )
    assert ok.status_code == 200
    assert (await second_device.post(f"{API}/auth/refresh")).status_code == 401
    assert (
        await client.post(f"{API}/auth/login", json={"email": user.email, "password": "Nova@Senha123"})
    ).status_code == 200
