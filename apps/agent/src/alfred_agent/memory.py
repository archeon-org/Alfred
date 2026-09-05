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
MEMORY_INDEX_CAPACITY = 256
MEMORY_INDEX_KEY = "recent-episodes-v1"

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


class MemoryIndexEntry(TypedDict):
    key: str
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


def _memory_index_namespace(namespace: tuple[str, ...]) -> tuple[str, ...]:
    return ("alfred", "indexes", *namespace[1:])


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

    namespaces = [memory_namespace(context)]
    if context.share_across_conversations:
        namespaces.append(shared_memory_namespace(context))

    records = [record for namespace in namespaces for record in _recall_namespace(store, namespace)]
    deduplicated = {memory_key(record): record for record in records}
    return sorted(deduplicated.values(), key=lambda record: record["created_at"], reverse=True)[
        :limit
    ]


def store_memory(store: BaseStore, context: MemoryContext, record: MemoryRecord) -> None:
    if not context.memory_enabled:
        return

    _store_in_namespace(store, memory_namespace(context), record)
    if context.share_across_conversations:
        _store_in_namespace(store, shared_memory_namespace(context), record)


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
        store.delete(_memory_index_namespace(namespace), MEMORY_INDEX_KEY)
    return deleted


def _store_in_namespace(
    store: BaseStore, namespace: tuple[str, ...], record: MemoryRecord
) -> None:
    key = memory_key(record)
    store.put(namespace, key, dict(record))

    index_namespace = _memory_index_namespace(namespace)
    index_item = store.get(index_namespace, MEMORY_INDEX_KEY)
    entries = _parse_memory_index(index_item.value) if index_item is not None else []
    by_key = {entry["key"]: entry for entry in entries}
    by_key[key] = {"key": key, "created_at": record["created_at"]}
    recent = sorted(by_key.values(), key=lambda entry: entry["created_at"], reverse=True)[
        :MEMORY_INDEX_CAPACITY
    ]
    store.put(index_namespace, MEMORY_INDEX_KEY, {"entries": recent})


def _recall_namespace(store: BaseStore, namespace: tuple[str, ...]) -> list[MemoryRecord]:
    index_item = store.get(_memory_index_namespace(namespace), MEMORY_INDEX_KEY)
    if index_item is None:
        items = store.search(namespace, limit=MEMORY_INDEX_CAPACITY)
    else:
        entries = _parse_memory_index(index_item.value)
        items = [item for entry in entries if (item := store.get(namespace, entry["key"]))]

    return [
        record
        for record in (_parse_memory_record(item.value) for item in items)
        if record is not None
    ]


def _parse_memory_index(value: Mapping[str, object]) -> list[MemoryIndexEntry]:
    raw_entries = value.get("entries")
    if not isinstance(raw_entries, list):
        return []

    entries: list[MemoryIndexEntry] = []
    for raw_entry in cast(list[object], raw_entries):
        if not isinstance(raw_entry, Mapping):
            continue
        typed_entry = cast(Mapping[str, object], raw_entry)
        key = typed_entry.get("key")
        created_at = typed_entry.get("created_at")
        if isinstance(key, str) and isinstance(created_at, str):
            entries.append({"key": key, "created_at": created_at})
    return entries


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
