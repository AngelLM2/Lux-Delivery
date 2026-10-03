from pydantic import BaseModel, ConfigDict, Field

class CategoryCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)

class CategoryUpdate(BaseModel):
    name: str = Field(min_length=2, max_length=100)

class CategoryRead(BaseModel):
    id: int
    name: str

    model_config = ConfigDict(from_attributes=True)
