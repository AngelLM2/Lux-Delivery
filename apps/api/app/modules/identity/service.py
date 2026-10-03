import hashlib
import logging
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from redis.exceptions import RedisError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import utcnow
from app.core.errors import BadRequest, Conflict, Forbidden, NotFound, ServiceUnavailable, TooManyRequests, Unauthorized
from app.core.pagination import cursor_id, encode_cursor
from app.core.rate_limit import RateLimiterUnavailable, hit, release
from app.core.redis import get_redis
from app.core.security import (
    IssuedToken,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    hash_token_id,
    verify_dummy_password,
    verify_password,
)
from app.modules.identity.models import User, UserRole
from app.modules.identity.repository import RefreshTokenRepository, UserRepository
from app.modules.identity.schemas import AdminUserCreate, LoginRequest, UserCreate, UserPage, UserRead, UserUpdate

logger = logging.getLogger(__name__)
security_logger = logging.getLogger("lux.security")


# --- User status cache ----------------------------------------------------------------------
# (active, role) is cached in Redis and invalidated on change, so deactivation beats a valid JWT.
# Invalidation leaves a short tombstone that (in Lua) stops a stale read from re-filling the cache;
# keys share a {user_id} hash tag for Redis Cluster. See docs/06-concorrencia-e-consistencia.md §8.

_TOMBSTONE_SECONDS = 30
_SET_UNLESS_INVALIDATED = """
if redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
return 1
"""


def _status_key(user_id: int) -> str:
    return f"lux:user:{{{user_id}}}:status"


def _tombstone_key(user_id: int) -> str:
    return f"lux:user:{{{user_id}}}:status:invalidated"


async def get_user_status(session: AsyncSession, user_id: int) -> tuple[bool, UserRole] | None:
    redis = get_redis()
    try:
        cached = await redis.get(_status_key(user_id))
        if cached:
            active, role = cached.split(":", 1)
            return active == "1", UserRole(role)
    except (RedisError, ValueError) as exc:
        logger.warning("user_status_cache_read_failed", extra={"error": str(exc)})

    status = await UserRepository(session).status(user_id)
    if status is not None:
        try:
            await redis.eval(
                _SET_UNLESS_INVALIDATED,
                2,
                _status_key(user_id),
                _tombstone_key(user_id),
                f"{int(status[0])}:{status[1].value}",
                settings.USER_STATUS_CACHE_TTL,
            )
        except RedisError as exc:
            logger.warning("user_status_cache_write_failed", extra={"error": str(exc)})
    return status


async def invalidate_user_status(user_id: int) -> None:
    try:
        async with get_redis().pipeline(transaction=True) as pipe:
            pipe.delete(_status_key(user_id))
            pipe.set(_tombstone_key(user_id), "1", ex=_TOMBSTONE_SECONDS)
            await pipe.execute()
    except RedisError as exc:
        logger.warning("user_status_cache_invalidate_failed", extra={"error": str(exc)})


# --- Access token denylist (logout before expiry) ---------------------------------------------


def _denylist_key(jti: str) -> str:
    return f"lux:auth:denylist:{jti}"


async def is_access_token_revoked(jti: str) -> bool:
    try:
        return bool(await get_redis().exists(_denylist_key(jti)))
    except RedisError:
        # Short-lived access tokens bound the damage; availability wins here.
        return False


async def revoke_access_token(jti: str, expires_at_ts: int) -> None:
    ttl = int(expires_at_ts - datetime.now(UTC).timestamp())
    if ttl <= 0:
        return
    try:
        await get_redis().set(_denylist_key(jti), "1", ex=ttl)
    except RedisError as exc:
        logger.warning("denylist_write_failed", extra={"error": str(exc)})


# --- Services -------------------------------------------------------------------------------


@dataclass(frozen=True)
class AuthResult:
    user: User
    access: IssuedToken
    refresh: IssuedToken


class AuthService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.users = UserRepository(session)
        self.tokens = RefreshTokenRepository(session)

    async def register(self, data: UserCreate) -> User:
        return await UserService(self.session).create(data, role=UserRole.CUSTOMER)

    async def bootstrap_admin(self, data: UserCreate, provided_token: str | None) -> User:
        expected = settings.BOOTSTRAP_ADMIN_TOKEN
        if not expected:
            raise Forbidden("Bootstrap de admin desabilitado neste ambiente.", code="bootstrap_disabled")
        if not provided_token or not secrets.compare_digest(provided_token, expected):
            raise Forbidden("Token de bootstrap invalido.", code="invalid_bootstrap_token")
        hashed = await hash_password(data.password)  # bcrypt before taking the lock and a connection
        await self.users.lock_bootstrap()
        if await self.users.admin_exists():
            raise Conflict("Administrador inicial ja foi criado.", code="admin_already_exists")
        return await UserService(self.session).create(data, role=UserRole.ADMIN, hashed_password=hashed)

    async def login(self, data: LoginRequest) -> AuthResult:
        # Reserve the attempt atomically *before* checking the password: checking and recording in
        # two steps let 30 concurrent guesses all pass a limit of 3.
        account_key = _account_key(data.email)
        slot = await _reserve_login_attempt(account_key)

        user = await self.users.get_by_email(data.email)
        snapshot = (user.id, user.hashed_password, user.is_active) if user else None
        # Give the DB connection back while bcrypt runs (~200 ms): otherwise a burst of logins
        # holds the whole pool and every other endpoint of this pod times out.
        await self.session.rollback()

        if snapshot is None:
            await verify_dummy_password(data.password)
            raise Unauthorized("Credenciais invalidas.", code="invalid_credentials")
        user_id, hashed, active = snapshot
        if not await verify_password(data.password, hashed):
            security_logger.info("login_failed", extra={"user_id": user_id})
            raise Unauthorized("Credenciais invalidas.", code="invalid_credentials")
        await _release_login_attempt(account_key, slot)  # successful logins do not count
        if not active:
            raise Forbidden("Usuario inativo.", code="user_inactive")

        # Short transaction, serialised with password changes and deactivation of this user.
        await self.tokens.lock_user_sessions(user_id)
        user = await self.users.get(user_id)
        if user is None or not user.is_active or user.hashed_password != hashed:
            raise Unauthorized("Credenciais invalidas.", code="invalid_credentials")
        result = await self._issue(user, family_id=uuid.uuid4())
        await self.users.update(user, {"last_login_at": utcnow()})
        await self.session.commit()
        return result

    async def refresh(self, raw_token: str) -> AuthResult:
        payload = decode_token(raw_token, "refresh")
        if not payload or not str(payload.get("sub", "")).isdigit():
            raise Unauthorized("Refresh token invalido ou expirado.", code="invalid_refresh_token")

        await self.tokens.lock_user_sessions(int(payload["sub"]))
        record = await self.tokens.get_for_update(hash_token_id(payload["jti"]))
        if record is None or str(record.user_id) != payload["sub"]:
            raise Unauthorized("Refresh token invalido.", code="invalid_refresh_token")

        now = utcnow()
        if record.revoked_at is not None:
            rotated_recently = record.replaced_by_jti_hash is not None and (now - record.revoked_at) <= timedelta(
                seconds=settings.REFRESH_REUSE_GRACE_SECONDS
            )
            if rotated_recently:
                # Concurrent refresh from another tab: the browser already holds the new cookie.
                raise Unauthorized("Refresh token ja rotacionado.", code="refresh_token_rotated")
            revoked = await self.tokens.revoke_family(record.family_id)
            await self.session.commit()
            security_logger.warning(
                "refresh_token_reuse_detected",
                extra={"user_id": record.user_id, "family_id": str(record.family_id), "revoked": revoked},
            )
            raise Unauthorized("Sessao invalidada por seguranca. Entre novamente.", code="refresh_token_reused")

        if record.expires_at <= now:
            raise Unauthorized("Refresh token expirado.", code="invalid_refresh_token")

        user = await self.users.get(record.user_id)
        if user is None or not user.is_active:
            raise Unauthorized("Usuario nao encontrado ou inativo.", code="user_inactive")

        result = await self._issue(user, family_id=record.family_id)
        record.revoked_at = now
        record.replaced_by_jti_hash = hash_token_id(result.refresh.jti)
        await self.session.commit()
        return result

    async def logout(self, raw_refresh: str | None, access_payload: dict | None) -> None:
        if raw_refresh:
            payload = decode_token(raw_refresh, "refresh")
            if payload and str(payload.get("sub", "")).isdigit():
                await self.tokens.lock_user_sessions(int(payload["sub"]))
                record = await self.tokens.get_for_update(hash_token_id(payload["jti"]))
                if record is not None:
                    await self.tokens.revoke_family(record.family_id)
                    await self.session.commit()
        if access_payload:
            await revoke_access_token(access_payload["jti"], access_payload["exp"])

    async def _issue(self, user: User, family_id: uuid.UUID) -> AuthResult:
        access = create_access_token(user.id, user.role.value)
        refresh = create_refresh_token(user.id, str(family_id))
        await self.tokens.add(
            user_id=user.id,
            family_id=family_id,
            jti_hash=hash_token_id(refresh.jti),
            expires_at=refresh.expires_at,
        )
        return AuthResult(user=user, access=access, refresh=refresh)


def _account_key(email: str) -> str:
    return f"login:acct:{hashlib.sha256(email.encode()).hexdigest()[:32]}"


async def _reserve_login_attempt(key: str) -> str | None:
    """Per-account limiter against credential stuffing from many IPs. Fails closed.

    Takes a slot atomically; the slot is given back when the password is right, so only failures
    accumulate. Once the account hits the limit even the right password waits for the window.
    """
    try:
        result = await hit(
            key, settings.LOGIN_MAX_ATTEMPTS_PER_ACCOUNT, settings.LOGIN_ACCOUNT_WINDOW_SECONDS, "login_account"
        )
    except RateLimiterUnavailable:
        raise ServiceUnavailable("Servico temporariamente indisponivel.") from None
    if not result.allowed:
        raise TooManyRequests(
            "Muitas tentativas para esta conta. Tente novamente mais tarde.",
            headers={"Retry-After": str(result.retry_after_seconds)},
        )
    return result.member


async def _release_login_attempt(key: str, member: str | None) -> None:
    if member is None:
        return
    try:
        await release(key, member)
    except RateLimiterUnavailable:
        logger.warning("login_slot_release_failed")


class UserService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.users = UserRepository(session)
        self.tokens = RefreshTokenRepository(session)

    async def create(
        self,
        data: UserCreate | AdminUserCreate,
        role: UserRole | None = None,
        hashed_password: str | None = None,
    ) -> User:
        # bcrypt first: no DB connection is held during the ~200 ms hash.
        hashed = hashed_password or await hash_password(data.password)
        email_taken, phone_taken = await self.users.email_or_phone_taken(data.email, data.phone)
        if email_taken:
            raise Conflict("Email ja cadastrado.", code="email_taken")
        if phone_taken:
            raise Conflict("Telefone ja cadastrado.", code="phone_taken")
        final_role = role or getattr(data, "role", UserRole.CUSTOMER)
        try:
            user = await self.users.add(
                User(
                    full_name=data.full_name,
                    email=data.email,
                    phone=data.phone,
                    hashed_password=hashed,
                    role=final_role,
                )
            )
            await self.session.commit()
        except IntegrityError:
            # Two concurrent sign-ups with the same e-mail: the unique constraint decides.
            await self.session.rollback()
            raise Conflict("Email ou telefone ja cadastrado.", code="email_taken") from None
        return user

    async def get(self, user_id: int) -> User:
        user = await self.users.get(user_id)
        if user is None:
            raise NotFound("Usuario nao encontrado.", code="user_not_found")
        return user

    async def list(self, *, limit: int, cursor: str | None, role: UserRole | None, search: str | None) -> UserPage:
        rows = await self.users.list_page(limit=limit + 1, after_id=cursor_id(cursor), role=role, search=search)
        has_more = len(rows) > limit
        rows = rows[:limit]
        next_cursor = encode_cursor({"id": rows[-1].id}) if has_more and rows else None
        return UserPage(items=[UserRead.model_validate(u) for u in rows], next_cursor=next_cursor)

    async def update_self(self, user: User, data: UserUpdate) -> User:
        changes = data.model_dump(exclude_unset=True)
        current_password = changes.pop("current_password", None)
        changes.pop("password_confirm", None)
        new_password = changes.pop("password", None)
        if not changes and not new_password:
            raise BadRequest("Nenhum campo enviado para atualizacao.", code="empty_update")
        if "full_name" in changes and changes["full_name"] is None:
            raise BadRequest("Campo 'full_name' nao pode ser nulo.", code="null_field")

        user_id, stored_hash = user.id, user.hashed_password
        if new_password:
            # Release the connection during the two bcrypt calls, then re-read under the user's
            # session lock (a password changed meanwhile by another session wins).
            await self.session.rollback()
            if not await verify_password(current_password or "", stored_hash):
                raise Forbidden("Senha atual incorreta.", code="invalid_current_password")
            changes["hashed_password"] = await hash_password(new_password)
            await self.tokens.lock_user_sessions(user_id)
            user = await self.get(user_id)
            if user.hashed_password != stored_hash:
                raise Conflict("A senha foi alterada em outra sessao.", code="password_changed_concurrently")

        if changes.get("phone") and changes["phone"] != user.phone:
            _, phone_taken = await self.users.email_or_phone_taken(None, changes["phone"])
            if phone_taken:
                raise Conflict("Telefone ja cadastrado.", code="phone_taken")

        await self.users.update(user, changes)
        if new_password:
            # Changing the password ends every other session (including refreshes in flight,
            # thanks to the session lock).
            await self.tokens.revoke_all_for_user(user_id)
        try:
            await self.session.commit()
        except IntegrityError:
            await self.session.rollback()
            raise Conflict("Telefone ja cadastrado.", code="phone_taken") from None
        return user

    async def set_active(self, user_id: int, active: bool, actor_id: int) -> User:
        await self.tokens.lock_user_sessions(user_id)
        user = await self.get(user_id)
        if not active:
            if user.id == actor_id:
                raise Conflict("Voce nao pode desativar a propria conta.", code="cannot_deactivate_self")
            if user.role == UserRole.ADMIN:
                raise Conflict("Nao e permitido desativar administrador.", code="cannot_deactivate_admin")
        await self.users.update(user, {"is_active": active})
        if not active:
            await self.tokens.revoke_all_for_user(user.id)
        await self.session.commit()
        await invalidate_user_status(user.id)
        return user
