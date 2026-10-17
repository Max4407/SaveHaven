from pydantic import BaseModel, Field


class DemoLoginRequest(BaseModel):
    user_id: str = Field(default="demo-player", max_length=64)


class SessionUserResponse(BaseModel):
    id: str
    display_name: str
