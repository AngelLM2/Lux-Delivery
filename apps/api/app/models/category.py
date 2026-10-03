from sqlalchemy import Column, String, Integer
from sqlalchemy.orm import relationship
from app.database import Base


class Category(Base):
    __tablename__ = "category"

    id = Column(Integer, autoincrement=True, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True, index=True)

    products = relationship("Product", back_populates="category")
