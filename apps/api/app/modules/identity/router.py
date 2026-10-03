from fastapi import APIRouter, Depends, Header, Query, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_session
from app.core.errors import Unauthorized
from app.core.logging import request_id_ctx
from app.core.security import ACCESS_COOKIE, REFRESH_COOKIE, decode_token
from app.modules.identity.dependencies import (
    Principal,
    auth_rate_limit,
    get_current_user,
    require_admin,
)
from app.modules.identity.models import User, UserRole
from app.modules.identity.schemas import (
    AdminUserCreate,
    LoginRequest,
    SessionResponse,
    TokenResponse,
    UserCreate,
    UserPage,
    UserRead,
    UserUpdate,
)
from app.modules.identity.service import AuthResult, AuthService, UserService

auth_router = APIRouter(prefix="/auth", tags=["auth"])
users_router = APIRouter(prefix="/users", tags=["users"])

_REFRESH_PATH = f"{settings.API_PREFIX}/auth"


def _set_session_cookies(response: Response, result: AuthResult) -> None:
    common = {
        "httponly": True,
        "secure": settings.cookie_secure,
        "samesite": "strict",
        "domain": settings.COOKIE_DOMAIN,
    }
    response.set_cookie(
        ACCESS_COOKIE,
        result.access.token,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
        **common,
    )
    # Scoped to /auth: the long-lived token is only sent to the endpoints that need it.
    response.set_cookie(
        REFRESH_COOKIE,
        result.refresh.token,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path=_REFRESH_PATH,
        **common,
    )


def _clear_session_cookies(response: Response) -> None:
    response.delete_cookie(ACCESS_COOKIE, path="/", domain=settings.COOKIE_DOMAIN)
    response.delete_cookie(REFRESH_COOKIE, path=_REFRESH_PATH, domain=settings.COOKIE_DOMAIN)


def _session_response(result: AuthResult) -> SessionResponse:
    return SessionResponse(user=UserRead.model_validate(result.user), access_expires_at=result.access.expires_at)


@auth_router.post(
    "/register",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(auth_rate_limit)],
)
async def register(data: UserCreate, session: AsyncSession = Depends(get_session)):
    return await AuthService(session).register(data)


@auth_router.post(
    "/bootstrap-admin",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(auth_rate_limit)],
)
async def bootstrap_admin(
    data: UserCreate,
    session: AsyncSession = Depends(get_session),
    bootstrap_token: str | None = Header(default=None, alias="X-Bootstrap-Token"),
):
    return await AuthService(session).bootstrap_admin(data, bootstrap_token)


@auth_router.post("/login", response_model=SessionResponse, dependencies=[Depends(auth_rate_limit)])
async def login(response: Response, data: LoginRequest, session: AsyncSession = Depends(get_session)):
    result = await AuthService(session).login(data)
    _set_session_cookies(response, result)
    return _session_response(result)


@auth_router.post("/token", response_model=TokenResponse, dependencies=[Depends(auth_rate_limit)])
async def token(
    response: Response,
    form: OAuth2PasswordRequestForm = Depends(),
    session: AsyncSession = Depends(get_session),
):
    """OAuth2 password flow for Swagger UI and scripts. Browsers use /auth/login."""
    try:
        credentials = LoginRequest(email=form.username, password=form.password)
    except ValidationError as exc:  # built by hand, so FastAPI would not turn this into a 422
        raise RequestValidationError(exc.errors()) from None
    result = await AuthService(session).login(credentials)
    _set_session_cookies(response, result)
    return TokenResponse(access_token=result.access.token, expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60)


@auth_router.post("/refresh", response_model=SessionResponse, dependencies=[Depends(auth_rate_limit)])
async def refresh(request: Request, response: Response, session: AsyncSession = Depends(get_session)):
    raw = request.cookies.get(REFRESH_COOKIE)
    if not raw:
        raise Unauthorized("Refresh token ausente.", code="missing_refresh_token")
    try:
        result = await AuthService(session).refresh(raw)
    except Unauthorized as exc:
        # Built by hand (instead of re-raising) so the failed session's cookies are cleared.
        error = JSONResponse(
            {"detail": exc.detail, "code": exc.code, "request_id": request_id_ctx.get()},
            status_code=status.HTTP_401_UNAUTHORIZED,
        )
        if exc.code != "refresh_token_rotated":
            _clear_session_cookies(error)
        return error
    _set_session_cookies(response, result)
    return _session_response(result)


@auth_router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, session: AsyncSession = Depends(get_session)):
    access = request.cookies.get(ACCESS_COOKIE)
    await AuthService(session).logout(
        request.cookies.get(REFRESH_COOKIE),
        decode_token(access, "access") if access else None,
    )
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    _clear_session_cookies(response)
    return response


@auth_router.get("/me", response_model=UserRead)
async def me(user: User = Depends(get_current_user)):
    return user


@users_router.get("", response_model=UserPage)
async def list_users(
    limit: int = Query(default=20, ge=1, le=settings.MAX_PAGE_SIZE),
    cursor: str | None = None,
    role: UserRole | None = None,
    q: str | None = Query(default=None, min_length=2, max_length=60),
    _: Principal = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    return await UserService(session).list(limit=limit, cursor=cursor, role=role, search=q)


@users_router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(
    data: AdminUserCreate,
    _: Principal = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    return await UserService(session).create(data)


@users_router.get("/me", response_model=UserRead)
async def get_profile(user: User = Depends(get_current_user)):
    return user


@users_router.patch("/me", response_model=UserRead)
async def update_profile(
    data: UserUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await UserService(session).update_self(user, data)


@users_router.patch("/{user_id}/deactivate", response_model=UserRead)
async def deactivate_user(
    user_id: int,
    principal: Principal = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    return await UserService(session).set_active(user_id, False, actor_id=principal.id)


@users_router.patch("/{user_id}/activate", response_model=UserRead)
async def activate_user(
    user_id: int,
    principal: Principal = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    return await UserService(session).set_active(user_id, True, actor_id=principal.id)
