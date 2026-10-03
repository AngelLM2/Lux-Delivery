import io
from datetime import timedelta

import jwt
import pytest
from PIL import Image
from pydantic import ValidationError

from app.core.config import Settings
from app.core.errors import BadRequest, UnsupportedMediaType
from app.core.pagination import decode_cursor, encode_cursor
from app.core.security import (
    _encode,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    hash_token_id,
    verify_password,
)
from app.modules.catalog.schemas import ProductUpdate
from app.modules.catalog.storage import process_image, sniff_image_type
from app.modules.identity.schemas import UserCreate, UserUpdate

# --- pagination ---------------------------------------------------------------------------------


def test_cursor_roundtrip_is_opaque_and_stable():
    cursor = encode_cursor({"c": "2026-10-03T10:00:00+00:00", "i": 42})
    assert "=" not in cursor and "{" not in cursor
    assert decode_cursor(cursor) == {"c": "2026-10-03T10:00:00+00:00", "i": 42}


@pytest.mark.parametrize("garbage", ["not-base64!!", "W10", "e30x"])
def test_invalid_cursor_is_a_400(garbage):
    with pytest.raises(BadRequest):
        decode_cursor(garbage)


def test_empty_cursor_means_first_page():
    assert decode_cursor(None) is None
    assert decode_cursor("") is None


# --- tokens -------------------------------------------------------------------------------------


def test_access_token_roundtrip():
    issued = create_access_token(7, "admin")
    payload = decode_token(issued.token, "access")
    assert payload["sub"] == "7" and payload["role"] == "admin" and payload["jti"] == issued.jti


def test_refresh_token_cannot_be_used_as_access_token():
    issued = create_refresh_token(7, "family")
    assert decode_token(issued.token, "access") is None
    assert decode_token(issued.token, "refresh")["fam"] == "family"


def test_expired_token_is_rejected():
    issued = _encode({"sub": "1"}, timedelta(seconds=-5), "access")
    assert decode_token(issued.token, "access") is None


def test_token_signed_with_another_key_is_rejected():
    forged = jwt.encode(
        {"sub": "1", "type": "access", "jti": "x", "iat": 0, "exp": 9999999999},
        "another-secret-key-that-is-long-enough-123",
        "HS256",
    )
    assert decode_token(forged, "access") is None


def test_alg_none_is_rejected():
    forged = jwt.encode({"sub": "1", "type": "access", "jti": "x", "iat": 0, "exp": 9999999999}, None, "none")
    assert decode_token(forged, "access") is None


def test_only_a_digest_of_the_token_id_is_stored():
    digest = hash_token_id("abc")
    assert len(digest) == 64 and "abc" not in digest


async def test_password_hash_roundtrip():
    hashed = await hash_password("Senha@Forte123")
    assert hashed.startswith("$2b$")
    assert await verify_password("Senha@Forte123", hashed)
    assert not await verify_password("errada", hashed)
    assert not await verify_password("x", "not-a-bcrypt-hash")


# --- schemas ------------------------------------------------------------------------------------


@pytest.mark.parametrize("weak", ["curta1!A", "semnumero!!AA", "SEMMINUSCULA1!", "semmaiuscula1!", "SemEspecial123"])
def test_password_policy(weak):
    with pytest.raises(ValidationError):
        UserCreate(full_name="Ana", email="ana@lux.dev", password=weak)


def test_user_create_normalizes_email_and_phone():
    user = UserCreate(full_name=" Ana ", email="ANA@Lux.Dev", phone="  ", password="Senha@Forte123")
    assert user.email == "ana@lux.dev" and user.full_name == "Ana" and user.phone is None


def test_password_change_requires_current_and_confirmation():
    with pytest.raises(ValidationError):
        UserUpdate(password="Nova@Senha123", password_confirm="Nova@Senha123")
    with pytest.raises(ValidationError):
        UserUpdate(current_password="x", password="Nova@Senha123", password_confirm="Outra@Senha123")


def test_product_update_is_partial():
    assert ProductUpdate(price="10.00").model_dump(exclude_unset=True) == {
        "price": __import__("decimal").Decimal("10.00")
    }


# --- settings -----------------------------------------------------------------------------------


def test_production_refuses_insecure_defaults():
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        Settings(ENV="production", _env_file=None)


def test_empty_optional_secrets_mean_disabled_in_production():
    # Regression: the deploy tutorial blanks BOOTSTRAP_ADMIN_TOKEN after use; "" must not
    # fail the ">= 32 chars" check and keep production from booting.
    settings = Settings(
        ENV="production", SECRET_KEY="x" * 40, BOOTSTRAP_ADMIN_TOKEN="", METRICS_TOKEN=" ", _env_file=None
    )
    assert settings.BOOTSTRAP_ADMIN_TOKEN is None and settings.METRICS_TOKEN is None


def test_list_settings_accept_csv():
    settings = Settings(CORS_ORIGINS="http://a.com, http://b.com", _env_file=None)
    assert settings.CORS_ORIGINS == ["http://a.com", "http://b.com"]


# --- images -------------------------------------------------------------------------------------


def _png(width=2400, height=1200) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), (200, 30, 30)).save(buffer, format="PNG")
    return buffer.getvalue()


def test_sniff_trusts_bytes_not_names():
    assert sniff_image_type(_png(10, 10)) == "image/png"
    assert sniff_image_type(b"<?php echo 1; ?>") is None


async def test_process_image_resizes_and_converts_to_webp():
    webp = await process_image(_png())
    image = Image.open(io.BytesIO(webp))
    assert image.format == "WEBP"
    assert max(image.size) == 1200


async def test_process_image_rejects_non_images():
    with pytest.raises(UnsupportedMediaType):
        await process_image(b"MZ\x90\x00 definitely not an image")


async def test_process_image_rejects_truncated_images():
    with pytest.raises(BadRequest):
        await process_image(_png(50, 50)[:40])
