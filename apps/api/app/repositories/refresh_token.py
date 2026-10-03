from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.refresh_token import RefreshToken


class RefreshTokenRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, user_id: int, jti_hash: str, expires_at: datetime) -> RefreshToken:
        token = RefreshToken(user_id=user_id, jti_hash=jti_hash, expires_at=expires_at)
        self.session.add(token)
        return token

    async def search_by_jti_hash(self, jti_hash: str, lock_for_update: bool = False) -> RefreshToken | None:
        query = select(RefreshToken).filter(RefreshToken.jti_hash == jti_hash)
        if lock_for_update:
            query = query.with_for_update()
        result = await self.session.execute(query)
        return result.scalars().first()

    async def revoke(self, token: RefreshToken, replaced_by_jti_hash: str | None = None) -> RefreshToken:
        token.revoked_at = datetime.now(timezone.utc)
        token.replaced_by_jti_hash = replaced_by_jti_hash
        return token
