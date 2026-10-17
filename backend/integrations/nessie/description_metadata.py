import re
from dataclasses import dataclass

_SAFE_TOKEN = re.compile(r"^[a-z0-9][a-z0-9_-]*$")
_SEED_PATTERN = re.compile(
    r"^\[savehaven:(?P<event_id>[^\]]+)\] "
    r"\[kind=(?P<kind>[^;\]]+);category=(?P<category>[^\]]+)\] "
    r"(?P<body>.*)$"
)
_DEMO_PATTERN = re.compile(
    r"^\[savehaven-demo:(?P<event_id>[^\]]+)\] "
    r"\[kind=(?P<kind>[^;\]]+);category=(?P<category>[^;\]]+);"
    r"plan=(?P<plan>[^\]]+)\] (?P<body>.*)$"
)
_LEGACY_SEED_PATTERN = re.compile(r"^\[savehaven:(?P<event_id>[^\]]+)\] (?P<body>.*)$")


@dataclass(frozen=True)
class DescriptionMetadata:
    event_id: str | None
    kind: str
    category: str
    merchant_name: str | None
    plan_status: str | None
    description: str


def format_seed_description(
    *,
    source_id: str,
    kind: str,
    category: str,
    merchant_name: str | None,
    description: str,
) -> str:
    _validate_token("source_id", source_id)
    _validate_token("kind", kind)
    _validate_token("category", category)
    body = _format_body(merchant_name, description)
    return _check_length(
        f"[savehaven:{source_id}] [kind={kind};category={category}] {body}"
    )


def format_demo_description(
    *,
    event_id: str,
    kind: str,
    category: str,
    plan_status: str,
    merchant_name: str | None,
    description: str,
) -> str:
    _validate_token("event_id", event_id)
    _validate_token("kind", kind)
    _validate_token("category", category)
    _validate_token("plan_status", plan_status)
    body = _format_body(merchant_name, description)
    return _check_length(
        f"[savehaven-demo:{event_id}] "
        f"[kind={kind};category={category};plan={plan_status}] {body}"
    )


def parse_description(
    value: str,
    *,
    default_kind: str,
    default_category: str,
) -> DescriptionMetadata:
    demo_match = _DEMO_PATTERN.match(value)
    if demo_match:
        merchant_name, description = _parse_body(demo_match.group("body"))
        return DescriptionMetadata(
            event_id=demo_match.group("event_id"),
            kind=demo_match.group("kind"),
            category=demo_match.group("category"),
            merchant_name=merchant_name,
            plan_status=demo_match.group("plan"),
            description=description,
        )

    seed_match = _SEED_PATTERN.match(value)
    if seed_match:
        merchant_name, description = _parse_body(seed_match.group("body"))
        return DescriptionMetadata(
            event_id=seed_match.group("event_id"),
            kind=seed_match.group("kind"),
            category=seed_match.group("category"),
            merchant_name=merchant_name,
            plan_status=None,
            description=description,
        )

    legacy_match = _LEGACY_SEED_PATTERN.match(value)
    if legacy_match:
        parts = legacy_match.group("body").split(" | ")
        category = parts[-1] if len(parts) >= 2 else default_category
        merchant_name = parts[-2] if len(parts) >= 3 else None
        description_parts = parts[:-2] if merchant_name else parts[:-1]
        description = " | ".join(description_parts) or default_kind
        return DescriptionMetadata(
            event_id=legacy_match.group("event_id"),
            kind=default_kind,
            category=category,
            merchant_name=merchant_name,
            plan_status=None,
            description=description,
        )

    return DescriptionMetadata(
        event_id=None,
        kind=default_kind,
        category=default_category,
        merchant_name=None,
        plan_status=None,
        description=value or default_kind,
    )


def _format_body(merchant_name: str | None, description: str) -> str:
    safe_merchant = _sanitize_text(merchant_name or "")
    safe_description = _sanitize_text(description) or "Demo transaction"
    return f"{safe_merchant} | {safe_description}"


def _parse_body(body: str) -> tuple[str | None, str]:
    merchant_name, separator, description = body.partition(" | ")
    if not separator:
        return None, body
    return merchant_name or None, description


def _sanitize_text(value: str) -> str:
    return " ".join(value.replace("|", "/").replace("[", "(").replace("]", ")").split())


def _validate_token(field: str, value: str) -> None:
    if not _SAFE_TOKEN.fullmatch(value):
        raise ValueError(f"{field} must contain only lowercase letters, numbers, '-' or '_'")


def _check_length(value: str) -> str:
    if len(value) > 240:
        raise ValueError("encoded Nessie description must be at most 240 characters")
    return value
