from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin


class Category(Base):
    __tablename__ = "category"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    products: Mapped[list["Product"]] = relationship(back_populates="category")


class Product(TimestampMixin, Base):
    __tablename__ = "product"
    __table_args__ = (
        CheckConstraint("price > 0", name="price_positive"),
        # Name is unique among live products only, so an archived name can be reused.
        Index(
            "uq_product_name_active",
            func.lower(text("name")),
            unique=True,
            postgresql_where=text("archived_at IS NULL"),
        ),
        Index("ix_product_category_active", "category_id", postgresql_where=text("archived_at IS NULL")),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    # Money is NUMERIC, never FLOAT: 0.1 + 0.2 != 0.3 in binary floating point.
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    description: Mapped[str] = mapped_column(String(1000), nullable=False, server_default="")
    short_description: Mapped[str] = mapped_column(String(255), nullable=False, server_default="")
    # Unbounded in the DB (v2 data has long URLs); the API limits new values to 500 chars.
    image_url: Mapped[str | None] = mapped_column(String, nullable=True)
    is_offer: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    highlights: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    is_available: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    category_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("category.id", ondelete="SET NULL"), nullable=True
    )
    # Soft delete: order_items keep pointing at the product forever (history must not break).
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    category: Mapped[Category | None] = relationship(back_populates="products")
