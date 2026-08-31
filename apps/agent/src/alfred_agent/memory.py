import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from hashlib import sha256
from typing import Literal, TypedDict, cast

from langgraph.store.base import BaseStore

MEMORY_SCHEMA_VERSION: Literal[1] = 1
MAX_MEMORY_TEXT_LENGTH = 500
MEMORY_RECALL_LIMIT = 5

_IDENTIFIER_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}")
_TOKEN_PATTERN = re.compile(
    r"\b(?:sk[-_][A-Za-z0-9_-]{8,}|gh[oprsu]_[A-Za-z0-9]{8,}|AKIA[A-Z0-9]{16}|"
    r"xox[baprs]-[A-Za-z0-9-]{8,}|glpat-[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{20,})\b",
    re.IGNORECASE,
)
_JWT_PATTERN = re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b")
_BEARER_PATTERN = re.compile(r"\bBearer\s+[^\s,;]+", re.IGNORECASE)
_PRIVATE_KEY_PATTERN = re.compile(
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----",
    re.DOTALL,
)
_NAMED_SECRET_PATTERN = re.compile(
    r"\b(api[_-]?key|password|passwd|secret|token|authorization)\s*[:=]\s*"
    r"(?:\"[^\"]*\"|'[^']*'|[^\s,;]+)",
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True)
class MemoryContext:
    user_id: str
    conversation_id: str
    memory_enabled: bool = True
    share_across_conversations: bool = False

    def __post_init__(self) -> None:
        _validate_identifier("user_id", self.user_id)
        _validate_identifier("conversation_id", self.conversation_id)


class MemoryRecord(TypedDict):
    schema_version: Literal[1]
    kind: Literal["planning_episode"]
    conversation_id: str
    objective: str
    outcome: str
    steps: list[str]
    created_at: str


def _validate_identifier(field: str, value: str) -> None:
    if _IDENTIFIER_PATTERN.fullmatch(value) is None:
        raise ValueError(f"{field} must be a non-empty identifier containing only safe characters")


def sanitize_memory_text(value: str) -> str:
    without_private_keys = _PRIVATE_KEY_PATTERN.sub("[REDACTED]", value)
    normalized = " ".join(without_private_keys.split())
    without_tokens = _TOKEN_PATTERN.sub("[REDACTED]", normalized)
    without_jwts = _JWT_PATTERN.sub("[REDACTED]", without_tokens)
    without_bearer = _BEARER_PATTERN.sub("Bearer [REDACTED]", without_jwts)
    redacted = _NAMED_SECRET_PATTERN.sub(
        lambda match: f"{match.group(1)}=[REDACTED]", without_bearer
    )
    return redacted[:MAX_MEMORY_TEXT_LENGTH]


def memory_namespace(context: MemoryContext) -> tuple[str, ...]:
    return (
        "alfred",
        "users",
        context.user_id,
        "conversations",
        context.conversation_id,
        "episodes",
    )


def shared_memory_namespace(context: MemoryContext) -> tuple[str, ...]:
    return ("alfred", "users", context.user_id, "shared", "planning_history")


def build_memory_record(
    *,
    context: MemoryContext,
    objective: str,
    outcome: str,
    steps: Sequence[str],
    created_at: datetime | None = None,
) -> MemoryRecord:
    timestamp = created_at or datetime.now(UTC)
    return {
        "schema_version": MEMORY_SCHEMA_VERSION,
        "kind": "planning_episode",
        "conversation_id": context.conversation_id,
        "objective": sanitize_memory_text(objective),
        "outcome": sanitize_memory_text(outcome),
        "steps": [sanitize_memory_text(step) for step in steps],
        "created_at": timestamp.isoformat(),
    }


def memory_key(record: MemoryRecord) -> str:
    identity = "\0".join(
        (record["conversation_id"], record["objective"], record["outcome"])
    ).encode()
    return f"episode-{sha256(identity).hexdigest()[:24]}"


def recall_memories(
    store: BaseStore,
    context: MemoryContext,
    *,
    limit: int = MEMORY_RECALL_LIMIT,
) -> list[MemoryRecord]:
    if not context.memory_enabled:
        return []

    items = list(store.search(memory_namespace(context), limit=limit))
    if context.share_across_conversations:
        items.extend(store.search(shared_memory_namespace(context), limit=limit))
    records = [
        record
        for record in (_parse_memory_record(item.value) for item in items)
        if record is not None
    ]
    deduplicated = {memory_key(record): record for record in records}
    return sorted(deduplicated.values(), key=lambda record: record["created_at"], reverse=True)[
        :limit
    ]


def store_memory(store: BaseStore, context: MemoryContext, record: MemoryRecord) -> None:
    if not context.memory_enabled:
        return

    store.put(memory_namespace(context), memory_key(record), dict(record))
    if context.share_across_conversations:
        store.put(shared_memory_namespace(context), memory_key(record), dict(record))


def forget_memories(
    store: BaseStore, context: MemoryContext, *, include_shared: bool = False
) -> int:
    """Delete the current conversation memories and optionally shared history."""
    namespaces = [memory_namespace(context)]
    if include_shared:
        namespaces.append(shared_memory_namespace(context))

    deleted = 0
    for namespace in namespaces:
        for item in store.search(namespace, limit=1_000):
            store.delete(namespace, item.key)
            deleted += 1
    return deleted


def _parse_memory_record(value: Mapping[str, object]) -> MemoryRecord | None:
    conversation_id = value.get("conversation_id")
    objective = value.get("objective")
    outcome = value.get("outcome")
    created_at = value.get("created_at")
    raw_steps = value.get("steps")
    if (
        value.get("schema_version") != MEMORY_SCHEMA_VERSION
        or value.get("kind") != "planning_episode"
        or not isinstance(conversation_id, str)
        or not isinstance(objective, str)
        or not isinstance(outcome, str)
        or not isinstance(created_at, str)
        or not isinstance(raw_steps, list)
    ):
        return None

    steps = cast(list[object], raw_steps)
    if not all(isinstance(step, str) for step in steps):
        return None
    typed_steps = cast(list[str], steps)

    record: MemoryRecord = {
        "schema_version": MEMORY_SCHEMA_VERSION,
        "kind": "planning_episode",
        "conversation_id": conversation_id,
        "objective": sanitize_memory_text(objective),
        "outcome": sanitize_memory_text(outcome),
        "steps": [sanitize_memory_text(step) for step in typed_steps],
        "created_at": created_at,
    }
    return record
