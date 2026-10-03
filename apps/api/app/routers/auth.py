from datetime import timedelta

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.auth.rate_limit import enforce_auth_rate_limit
from app.config import settings
from app.database import get_session
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.user import UserCreate, UserRead
from app.services.auth import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])

_ACCESS_MAX_AGE = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
_REFRESH_MAX_AGE = settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400


_ACCESS_COOKIE_KWARGS = dict(httponly=True, secure=settings.is_production, samesite="strict", path="/")
_REFRESH_COOKIE_KWARGS = dict(httponly=True, secure=settings.is_production, samesite="strict", path="/auth")


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=access_token,
        max_age=_ACCESS_MAX_AGE,
        **_ACCESS_COOKIE_KWARGS,
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        max_age=_REFRESH_MAX_AGE,
        **_REFRESH_COOKIE_KWARGS,
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(key="access_token", path="/")
    response.delete_cookie(key="refresh_token", path="/auth")


@router.post(
    "/register",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(enforce_auth_rate_limit)],
)
async def register_user(data: UserCreate, session: AsyncSession = Depends(get_session)):
    service = AuthService(session)
    return await service.register(data)


@router.post(
    "/bootstrap-admin",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(enforce_auth_rate_limit)],
)
async def bootstrap_admin(
    data: UserCreate,
    session: AsyncSession = Depends(get_session),
    bootstrap_token: str | None = Header(default=None, alias="X-Bootstrap-Token"),
):
    service = AuthService(session)
    return await service.bootstrap_admin(data, bootstrap_token)


@router.post(
    "/login",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(enforce_auth_rate_limit)],
)
async def login(
    response: Response,
    data: LoginRequest,
    session: AsyncSession = Depends(get_session),
):
    service = AuthService(session)
    tokens = await service.login(data)
    _set_auth_cookies(response, tokens["access_token"], tokens["refresh_token"])
    return TokenResponse()


@router.post(
    "/token",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(enforce_auth_rate_limit)],
)
async def token(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: AsyncSession = Depends(get_session),
):
    service = AuthService(session)
    data = LoginRequest(email=form_data.username, password=form_data.password)
    tokens = await service.login(data)
    _set_auth_cookies(response, tokens["access_token"], tokens["refresh_token"])
    return TokenResponse()


@router.post(
    "/refresh",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(enforce_auth_rate_limit)],
)
async def refresh_token(
    response: Response,
    refresh_token: str | None = Cookie(default=None),
    session: AsyncSession = Depends(get_session),
):
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token ausente.",
        )
    service = AuthService(session)
    tokens = await service.refresh(refresh_token)
    _set_auth_cookies(response, tokens["access_token"], tokens["refresh_token"])
    return TokenResponse()


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def logout(
    response: Response,
    refresh_token: str | None = Cookie(default=None),
    session: AsyncSession = Depends(get_session),
):
    if refresh_token:
        service = AuthService(session)
        await service.logout(refresh_token)
    _clear_auth_cookies(response)


@router.get("/me", response_model=UserRead, status_code=status.HTTP_200_OK)
async def who_am_i(current_user=Depends(get_current_user)):
    return current_user