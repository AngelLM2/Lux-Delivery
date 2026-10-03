import io

import pytest
from PIL import Image

from tests.conftest import API, create_category, create_product

pytestmark = pytest.mark.integration


async def test_public_can_browse_but_not_write(anon, customer):
    assert (await anon.get(f"{API}/products")).status_code == 200
    assert (await anon.get(f"{API}/categories")).status_code == 200
    payload = {"name": "Hack", "price": "1.00"}
    assert (await anon.post(f"{API}/products", json=payload)).status_code == 401
    customer_client, _ = customer
    assert (await customer_client.post(f"{API}/products", json=payload)).status_code == 403


async def test_create_product_validates_input(admin):
    client, _ = admin
    bad_price = await client.post(f"{API}/products", json={"name": "Agua", "price": "0"})
    assert bad_price.status_code == 422
    too_precise = await client.post(f"{API}/products", json={"name": "Agua", "price": "1.999"})
    assert too_precise.status_code == 422
    unknown_category = await client.post(f"{API}/products", json={"name": "Agua", "price": "5", "category_id": 999})
    assert unknown_category.status_code == 404


async def test_product_name_is_unique_case_insensitive(admin):
    client, _ = admin
    await create_product(client, name="Pizza Margherita")
    duplicate = await client.post(f"{API}/products", json={"name": "pizza margherita", "price": "10"})
    assert duplicate.status_code == 409 and duplicate.json()["code"] == "product_exists"


async def test_patch_changes_only_the_fields_sent(admin):
    client, _ = admin
    category = await create_category(client)
    product = await create_product(client, category_id=category["id"], is_offer=True)
    response = await client.patch(f"{API}/products/{product['id']}", json={"price": "30.00"})
    body = response.json()
    assert response.status_code == 200
    assert body["price"] == 30.0
    assert body["is_offer"] is True and body["category_id"] == category["id"]  # untouched
    assert (await client.patch(f"{API}/products/{product['id']}", json={"name": None})).status_code == 400


async def test_archived_product_leaves_menu_but_not_history(admin, anon):
    client, _ = admin
    product = await create_product(client)
    assert (await client.delete(f"{API}/products/{product['id']}")).status_code == 204

    public_ids = [p["id"] for p in (await anon.get(f"{API}/products")).json()["items"]]
    assert product["id"] not in public_ids
    assert (await anon.get(f"{API}/products/{product['id']}")).status_code == 404

    admin_view = (await client.get(f"{API}/products/admin")).json()["items"]
    archived = next(p for p in admin_view if p["id"] == product["id"])
    assert archived["archived_at"] is not None

    # The name is free again for a new product, and restoring the old one now conflicts.
    await create_product(client, name=product["name"])
    assert (await client.post(f"{API}/products/{product['id']}/restore")).status_code == 409


async def test_deleting_category_keeps_products(admin, anon):
    client, _ = admin
    category = await create_category(client)
    product = await create_product(client, category_id=category["id"])
    assert (await client.delete(f"{API}/categories/{category['id']}")).status_code == 204
    fetched = (await anon.get(f"{API}/products/{product['id']}")).json()
    assert fetched["category_id"] is None


async def test_catalog_cache_is_invalidated_after_writes(admin, anon):
    client, _ = admin
    first = (await anon.get(f"{API}/products")).json()["items"]
    assert first == []
    assert (await anon.get(f"{API}/products")).json()["items"] == []  # served from cache now
    product = await create_product(client)
    after_create = (await anon.get(f"{API}/products")).json()["items"]
    assert [p["id"] for p in after_create] == [product["id"]]
    await client.patch(f"{API}/products/{product['id']}", json={"price": "99.90"})
    assert (await anon.get(f"{API}/products")).json()["items"][0]["price"] == 99.9


async def test_categories_are_ordered_by_position(admin, anon):
    client, _ = admin
    await client.post(f"{API}/categories", json={"name": "Sobremesas", "position": 2})
    await client.post(f"{API}/categories", json={"name": "Entradas", "position": 0})
    dup = await client.post(f"{API}/categories", json={"name": "entradas"})
    assert dup.status_code == 409
    names = [c["name"] for c in (await anon.get(f"{API}/categories")).json()]
    assert names == ["Entradas", "Sobremesas"]


async def test_filters_and_pagination(admin, anon):
    client, _ = admin
    drinks = await create_category(client, "Bebidas")
    for i in range(5):
        await create_product(client, name=f"Suco {i}", category_id=drinks["id"], is_offer=i % 2 == 0)
    await create_product(client, name="Lasanha")

    page1 = (await anon.get(f"{API}/products", params={"limit": 2, "category_id": drinks["id"]})).json()
    page2 = (
        await anon.get(
            f"{API}/products", params={"limit": 2, "category_id": drinks["id"], "cursor": page1["next_cursor"]}
        )
    ).json()
    page3 = (
        await anon.get(
            f"{API}/products", params={"limit": 2, "category_id": drinks["id"], "cursor": page2["next_cursor"]}
        )
    ).json()
    names = [p["name"] for p in page1["items"] + page2["items"] + page3["items"]]
    assert names == [f"Suco {i}" for i in range(5)] and page3["next_cursor"] is None

    offers = (await anon.get(f"{API}/products", params={"offers_only": True})).json()["items"]
    assert {p["name"] for p in offers} == {"Suco 0", "Suco 2", "Suco 4"}
    search = (await anon.get(f"{API}/products", params={"q": "LASAN"})).json()["items"]
    assert [p["name"] for p in search] == ["Lasanha"]
    assert (await anon.get(f"{API}/products", params={"cursor": "lixo!"})).status_code == 400


async def test_image_upload_converts_to_webp_and_is_served(admin, anon):
    client, _ = admin
    product = await create_product(client)
    buffer = io.BytesIO()
    Image.new("RGB", (1600, 900), (10, 120, 60)).save(buffer, format="PNG")
    response = await client.post(
        f"{API}/products/{product['id']}/image", files={"file": ("foto.png", buffer.getvalue(), "image/png")}
    )
    assert response.status_code == 200, response.text
    url = response.json()["image_url"]
    assert url.startswith("/media/products/") and url.endswith(".webp")
    served = await anon.get(url)
    assert served.status_code == 200 and served.content[8:12] == b"WEBP"


async def test_image_upload_rejects_disguised_files(admin):
    client, _ = admin
    product = await create_product(client)
    response = await client.post(
        f"{API}/products/{product['id']}/image",
        files={"file": ("foto.png", b"<script>alert(1)</script>", "image/png")},
    )
    assert response.status_code == 415


async def test_image_url_only_accepts_web_or_media_urls(admin):
    client, _ = admin
    for bad in ("javascript:alert(1)", "data:image/png;base64,AAAA", "file:///etc/passwd"):
        response = await client.post(f"{API}/products", json={"name": f"X {bad[:4]}", "price": "1", "image_url": bad})
        assert response.status_code == 422, bad
    ok = await client.post(
        f"{API}/products", json={"name": "Yakisoba", "price": "1", "image_url": "https://cdn.lux.dev/y.webp"}
    )
    assert ok.status_code == 201
