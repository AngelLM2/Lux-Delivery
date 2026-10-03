from pydantic import BaseModel, ConfigDict, Field


class ProductCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    price: float = Field(gt=0)
    description: str | None = Field(default=None, min_length=2, max_length=1000)
    short_description: str | None = Field(default=None, min_length=2, max_length=200)
    is_offer: bool | None = False
    category_id: int
    highlights: bool | None = False


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    price: float | None = Field(default=None, gt=0)
    description: str | None = Field(default=None, min_length=2, max_length=1000)
    short_description: str | None = Field(default=None, min_length=2, max_length=200)
    is_offer: bool | None = False
    category_id: int
    highlights: bool | None = False


class ProductRead(BaseModel):
    id: int
    name: str
    price: float
    description: str
    short_description: str
    image_url: str | None = None
    is_offer: bool | None = False
    category_id: int 
    highlights: bool | None = False

    model_config = ConfigDict(from_attributes=True)
