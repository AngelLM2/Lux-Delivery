import hashlib
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import anyio
import bcrypt
import jwt

from app.core.config import settings

ACCESS_COOKIE = "lux_access"
REFRESH_COOKIE = "lux_refresh"


# --- Passwords -------------------------------------------------------------------------------
# bcrypt is deliberately slow (~200 ms at cost 12). Running it on the event loop would freeze
# every other request served by this process during each login, so it goes to a worker thread.


def _hash_sync(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=settings.BCRYPT_ROUNDS)).decode()


def _verify_sync(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


async def hash_password(password: str) -> str:
    return await anyio.to_thread.run_sync(_hash_sync, password)


async def verify_password(password: str, hashed: str) -> bool:
    return await anyio.to_thread.run_sync(_verify_sync, password, hashed)


# Used when the e-mail does not exist so the response time does not reveal which accounts exist.
_DUMMY_HASH = bcrypt.hashpw(b"timing-equalizer", bcrypt.gensalt(rounds=settings.BCRYPT_ROUNDS)).decode()


async def verify_dummy_password(password: str) -> None:
    await verify_password(password, _DUMMY_HASH)


# --- JWT ---------------------------------------------------------------------------------------


@dataclass(frozen=True)
class IssuedToken:
    token: str
    jti: str
    expires_at: datetime


def _encode(claims: dict, ttl: timedelta, token_type: str) -> IssuedToken:
    now = datetime.now(UTC)
    jti = uuid4().hex
    expires_at = now + ttl
    payload = {
        **claims,
        "type": token_type,
        "jti": jti,
        "iat": now,
        "nbf": now,
        "exp": expires_at,
        "iss": settings.JWT_ISSUER,
    }
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return IssuedToken(token=token, jti=jti, expires_at=expires_at)


def create_access_token(user_id: int, role: str) -> IssuedToken:
    return _encode(
        {"sub": str(user_id), "role": role},
        timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        "access",
    )


def create_refresh_token(user_id: int, family_id: str) -> IssuedToken:
    return _encode(
        {"sub": str(user_id), "fam": family_id},
        timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        "refresh",
    )


def decode_token(token: str, expected_type: str) -> dict | None:
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            issuer=settings.JWT_ISSUER,
            options={"require": ["exp", "iat", "sub", "jti", "type"]},
        )
    except jwt.PyJWTError:
        return None
    if payload.get("type") != expected_type:
        return None
    return payload


def hash_token_id(jti: str) -> str:
    """Only a digest of the refresh token id is stored: a DB leak does not leak sessions."""
    return hashlib.sha256(jti.encode()).hexdigest()
