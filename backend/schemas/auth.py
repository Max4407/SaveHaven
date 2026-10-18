from pydantic import BaseModel, Field


class DemoLoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class SessionUserResponse(BaseModel):
    id: str
    display_name: str
