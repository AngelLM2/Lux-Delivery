import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.core.pagination import Page
from app.modules.identity.models import UserRole

PASSWORD_POLICY_MESSAGE = (
    "Senha fraca. Use ao menos 10 caracteres com letra maiuscula, letra minuscula, numero e caractere especial."
)
_BCRYPT_MAX_BYTES = 72
_PHONE_RE = re.compile(r"^\+?[0-9 ()-]{8,25}$")


def _validate_password(password: str) -> str:
    if len(password.encode()) > _BCRYPT_MAX_BYTES:
        raise ValueError("Senha muito longa (maximo 72 bytes).")
    checks = (
        any(c.isupper() for c in password),
        any(c.islower() for c in password),
        any(c.isdigit() for c in password),
        any(not c.isalnum() for c in password),
    )
    if not all(checks):
        raise ValueError(PASSWORD_POLICY_MESSAGE)
    return password


def _normalize_phone(phone: str | None) -> str | None:
    if phone is None:
        return None
    phone = phone.strip()
    if not phone:
        return None
    if not _PHONE_RE.match(phone):
        raise ValueError("Telefone invalido.")
    return phone


class UserCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr = Field(max_length=120)
    phone: str | None = Field(default=None, max_length=25)
    password: str = Field(min_length=10, max_length=128)

    @field_validator("email")
    @classmethod
    def _lower_email(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("full_name")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        return value.strip()

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str | None) -> str | None:
        return _normalize_phone(value)

    @field_validator("password")
    @classmethod
    def _password(cls, value: str) -> str:
        return _validate_password(value)


class AdminUserCreate(UserCreate):
    role: UserRole = UserRole.CUSTOMER


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Field(default=None, max_length=25)
    current_password: str | None = Field(default=None, max_length=128)
    password: str | None = Field(default=None, min_length=10, max_length=128)
    password_confirm: str | None = Field(default=None, max_length=128)

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str | None) -> str | None:
        return _normalize_phone(value)

    @field_validator("password")
    @classmethod
    def _password(cls, value: str | None) -> str | None:
        return None if value is None else _validate_password(value)

    @model_validator(mode="after")
    def _password_change(self) -> "UserUpdate":
        if self.password is not None:
            if not self.current_password:
                raise ValueError("Informe a senha atual para alterar a senha.")
            if self.password != self.password_confirm:
                raise ValueError("As senhas nao conferem.")
        return self


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=120)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def _lower_email(cls, value: str) -> str:
        return value.strip().lower()


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    email: str
    phone: str | None = None
    role: UserRole
    is_active: bool
    created_at: datetime
    updated_at: datetime
    last_login_at: datetime | None = None


class SessionResponse(BaseModel):
    """Login/refresh response. Tokens travel in HttpOnly cookies, never in the body."""

    user: UserRead
    access_expires_at: datetime


class TokenResponse(BaseModel):
    """OAuth2 password-flow response for non-browser clients (Swagger UI, k6, CLI)."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int


# Module-level (strong) reference to the parametrised model: pydantic caches generic
# parametrisations weakly, and under load the class was being rebuilt per request (seen in py-spy).
UserPage = Page[UserRead]
