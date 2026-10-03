import uuid
from datetime import datetime

from sqlalchemy import func, or_, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utcnow
from app.modules.identity.models import RefreshToken, User, UserRole


class UserRepository:
    # Whitelist of columns a service may change: protects against mass assignment.
    _UPDATABLE = frozenset({"full_name", "phone", "is_active", "hashed_password", "role", "last_login_at"})
    _BOOTSTRAP_LOCK_ID = 824311

    def __init__(self, session: AsyncSession):
        self.session = session

    async def add(self, user: User) -> User:
        self.session.add(user)
        await self.session.flush()
        return user

    async def get(self, user_id: int) -> User | None:
        return await self.session.get(User, user_id)

    async def get_by_email(self, email: str) -> User | None:
        return (await self.session.execute(select(User).where(User.email == email))).scalar_one_or_none()

    async def email_or_phone_taken(self, email: str | None, phone: str | None) -> tuple[bool, bool]:
        conditions = []
        if email:
            conditions.append(User.email == email)
        if phone:
            conditions.append(User.phone == phone)
        if not conditions:
            return False, False
        rows = (await self.session.execute(select(User.email, User.phone).where(or_(*conditions)))).all()
        return any(r.email == email for r in rows), any(phone and r.phone == phone for r in rows)

    async def status(self, user_id: int) -> tuple[bool, UserRole] | None:
        row = (await self.session.execute(select(User.is_active, User.role).where(User.id == user_id))).first()
        return (row.is_active, row.role) if row else None

    async def list_page(
        self, *, limit: int, after_id: int | None, role: UserRole | None, search: str | None
    ) -> list[User]:
        query = select(User).order_by(User.id.asc()).limit(limit)
        if after_id:
            query = query.where(User.id > after_id)
        if role:
            query = query.where(User.role == role)
        if search:
            pattern = f"%{search.lower()}%"
            query = query.where(or_(func.lower(User.full_name).like(pattern), User.email.like(pattern)))
        return list((await self.session.execute(query)).scalars())

    async def update(self, user: User, changes: dict) -> User:
        for key, value in changes.items():
            if key not in self._UPDATABLE:
                raise ValueError(f"Campo '{key}' nao e atualizavel.")
            setattr(user, key, value)
        await self.session.flush()
        return user

    async def lock_bootstrap(self) -> None:
        """Serialises concurrent bootstrap requests for the lifetime of the transaction."""
        await self.session.execute(text("SELECT pg_advisory_xact_lock(:id)"), {"id": self._BOOTSTRAP_LOCK_ID})

    async def admin_exists(self) -> bool:
        query = select(User.id).where(User.role == UserRole.ADMIN).limit(1)
        return (await self.session.execute(query)).scalar_one_or_none() is not None


class RefreshTokenRepository:
    _SESSIONS_LOCK_CLASS = 824313

    def __init__(self, session: AsyncSession):
        self.session = session

    async def lock_user_sessions(self, user_id: int) -> None:
        """Serialise every change to one user's sessions until the transaction ends.

        Without it, a refresh that has inserted (but not committed) a new token is invisible to a
        concurrent "revoke all" (password change, deactivation, logout) and survives it.
        """
        await self.session.execute(
            text("SELECT pg_advisory_xact_lock(:cls, :uid)"), {"cls": self._SESSIONS_LOCK_CLASS, "uid": user_id}
        )

    async def add(self, *, user_id: int, family_id: uuid.UUID, jti_hash: str, expires_at: datetime) -> None:
        self.session.add(RefreshToken(user_id=user_id, family_id=family_id, jti_hash=jti_hash, expires_at=expires_at))
        await self.session.flush()

    async def get_for_update(self, jti_hash: str) -> RefreshToken | None:
        query = select(RefreshToken).where(RefreshToken.jti_hash == jti_hash).with_for_update()
        return (await self.session.execute(query)).scalar_one_or_none()

    async def revoke_family(self, family_id: uuid.UUID) -> int:
        result = await self.session.execute(
            update(RefreshToken)
            .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=utcnow())
        )
        return result.rowcount or 0

    async def revoke_all_for_user(self, user_id: int) -> int:
        result = await self.session.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=utcnow())
        )
        return result.rowcount or 0
