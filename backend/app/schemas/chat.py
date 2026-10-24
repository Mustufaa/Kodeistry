from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator
from typing import Annotated

ChatText = Annotated[str, StringConstraints(strip_whitespace=True, strict=True, min_length=1, max_length=1000)]


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: ChatText


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: ChatText
    history: list[ChatMessage] = Field(default_factory=list, max_length=8)

    @model_validator(mode="after")
    def bounded_total(self):
        if len(self.message) + sum(len(item.content) for item in self.history) > 6000:
            raise ValueError("Conversation is too long.")
        return self


class ChatResponse(BaseModel):
    reply: str
