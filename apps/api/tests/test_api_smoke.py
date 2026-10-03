import unittest
from uuid import uuid4

from fastapi.testclient import TestClient

from app.auth.jwt import create_access_token
from app.main import app


class ApiSmokeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app, raise_server_exceptions=False)
        cls.client.__enter__()
        cls.admin_id, cls.admin_token = cls._find_admin_token()

    @classmethod
    def tearDownClass(cls):
        cls.client.__exit__(None, None, None)

    @classmethod
    def _find_admin_token(cls) -> tuple[int, str]:
        for candidate_id in range(1, 51):
            candidate_token = create_access_token(candidate_id, "admin")
            response = cls.client.get("/users/me", cookies={"access_token": candidate_token})
            if response.status_code != 200:
                continue
            payload = response.json()
            if payload.get("role") == "admin":
                return candidate_id, candidate_token
        raise RuntimeError("Nao foi possivel encontrar um usuario admin ativo para os testes.")

    def test_users_list_supports_nullable_phone(self):
        response = self.client.get("/users/", cookies={"access_token": self.admin_token})
        self.assertEqual(response.status_code, 200, response.text)

        users = response.json()
        self.assertGreaterEqual(len(users), 1)
        for user in users:
            phone = user.get("phone")
            self.assertTrue(phone is None or isinstance(phone, str))

    def test_users_me_returns_authenticated_profile(self):
        response = self.client.get("/users/me", cookies={"access_token": self.admin_token})
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["id"], self.admin_id)
        self.assertEqual(payload["role"], "admin")

    def test_categories_create_requires_authentication(self):
        blocked = self.client.post("/categories/", json={"name": f"blocked-{uuid4().hex[:8]}"})
        self.assertEqual(blocked.status_code, 401, blocked.text)

    def test_categories_admin_crud(self):
        name = f"smoke-cat-{uuid4().hex[:8]}"
        create_resp = self.client.post(
            "/categories/",
            json={"name": name},
            cookies={"access_token": self.admin_token},
        )
        self.assertEqual(create_resp.status_code, 201, create_resp.text)
        category_id = create_resp.json()["id"]

        try:
            update_resp = self.client.patch(
                f"/categories/{category_id}",
                json={"name": f"{name}-updated"},
                cookies={"access_token": self.admin_token},
            )
            self.assertEqual(update_resp.status_code, 200, update_resp.text)
        finally:
            delete_resp = self.client.delete(
                f"/categories/{category_id}",
                cookies={"access_token": self.admin_token},
            )
            self.assertEqual(delete_resp.status_code, 200, delete_resp.text)


if __name__ == "__main__":
    unittest.main(verbosity=2)
