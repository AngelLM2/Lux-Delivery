from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.user import UserRole

PASSWORD_POLICY_MESSAGE = (
    "Senha fraca. Use ao menos 10 caracteres com letra maiuscula, "
    "letra minuscula, numero e caractere especial."
)
PASSWORD_MAX_BCRYPT_BYTES = 72
PASSWORD_MAX_BCRYPT_BYTES_MESSAGE = (
    "Senha muito longa para o algoritmo atual. Use no maximo 72 bytes."
)


def _validate_password_strength(password: str) -> str:
    has_upper = any(char.isupper() for char in password)
    has_lower = any(char.islower() for char in password)
    has_digit = any(char.isdigit() for char in password)
    has_special = any(not char.isalnum() for char in password)
    if not (has_upper and has_lower and has_digit and has_special):
        raise ValueError(PASSWORD_POLICY_MESSAGE)
    return password


def _validate_password_bcrypt_bytes(password: str) -> str:
    if len(password.encode("utf-8")) > PASSWORD_MAX_BCRYPT_BYTES:
        raise ValueError(PASSWORD_MAX_BCRYPT_BYTES_MESSAGE)
    return password



class UserCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=120)
    phone: str = Field(min_length=8, max_length=25)
    password: str = Field(min_length=10, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("password")
    @classmethod
    def validate_password(cls, password: str) -> str:
        password = _validate_password_strength(password)
        return _validate_password_bcrypt_bytes(password)



class AdminUserCreate(UserCreate):
    role: UserRole = UserRole.CUSTOMER



class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Field(default=None, min_length=8, max_length=25)
    current_password: str = Field(default=None, min_length=10, max_length=128)
    password: str | None = Field(default=None, min_length=10, max_length=128)
    password_confirm: str | None = Field(default=None, min_length=10, max_length=128)

    @field_validator("password")
    @classmethod
    def validate_password(cls, password: str | None) -> str | None:
        if password is None:
            return None
        password = _validate_password_strength(password)
        return _validate_password_bcrypt_bytes(password)

    @model_validator(mode="after")
    def validate_password_change(self) -> "UserUpdate":
        if self.password is not None:
            if not self.current_password:
                raise ValueError("Informe a senha atual para alterar a senha.")
            if self.password != self.password_confirm:
                raise ValueError("As senhas nao conferem.")
        return self


class UserRead(BaseModel):
    id: int
    full_name: str
    email: str
    phone: str | None = None
    role: UserRole
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
