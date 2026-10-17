from typing import Any

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer


class InvalidSessionError(ValueError):
    pass


class SessionManager:
    def __init__(self, secret: str, max_age_seconds: int) -> None:
        self._serializer = URLSafeTimedSerializer(secret, salt="savehaven-demo-session")
        self._max_age_seconds = max_age_seconds

    def create_token(self, user_id: str) -> str:
        return self._serializer.dumps({"user_id": user_id})

    def read_user_id(self, token: str) -> str:
        try:
            payload: Any = self._serializer.loads(
                token,
                max_age=self._max_age_seconds,
            )
        except (BadSignature, SignatureExpired) as error:
            raise InvalidSessionError("The demo session is invalid or expired") from error

        if not isinstance(payload, dict) or not isinstance(payload.get("user_id"), str):
            raise InvalidSessionError("The demo session payload is invalid")
        return payload["user_id"]
