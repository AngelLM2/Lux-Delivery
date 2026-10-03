from sqlalchemy import Boolean, Column, Float, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import relationship
from app.database import Base


class Product(Base):
    __tablename__ = "product"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    price = Column(Numeric(12, 2), nullable=False)
    description = Column(String(1000), nullable=False)
    short_description = Column(String(255), nullable=False)
    image_url = Column(String, nullable=True)
    is_offer = Column(Boolean, default=False, nullable=False)
    category_id = Column(Integer, ForeignKey("category.id"), nullable=True)
    highlights = Column(Boolean, default=False, nullable=False)

    category = relationship("Category", back_populates="products")
    order_items = relationship("OrderItem", back_populates="product")
