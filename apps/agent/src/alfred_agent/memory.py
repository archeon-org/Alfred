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
MEMORY_INDEX_KEY = "recent-episodes-v1"
MEMORY_DELETE_BATCH_SIZE = 256

_MEMORY_INDEX_TIMESTAMP_CEILING_MICROSECONDS = 10**18 - 1
_UNIX_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)

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
        (
            record["conversation_id"],
            record["objective"],
            record["outcome"],
            record["created_at"],
        )
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

    records = [
        record
        for namespace in namespaces
        for record in _recall_namespace(store, namespace, limit=limit)
    ]
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
        while items := store.search(namespace, limit=MEMORY_DELETE_BATCH_SIZE):
            for item in items:
                store.delete(item.namespace, item.key)
                deleted += 1
        store.delete(_memory_index_namespace(namespace), MEMORY_INDEX_KEY)
        index_entries_namespace = _memory_index_entries_namespace(namespace)
        while index_items := store.search(
            index_entries_namespace, limit=MEMORY_DELETE_BATCH_SIZE
        ):
            for item in index_items:
                store.delete(item.namespace, item.key)
    return deleted


def _store_in_namespace(
    store: BaseStore, namespace: tuple[str, ...], record: MemoryRecord
) -> None:
    key = memory_key(record)
    entry: MemoryIndexEntry = {"key": key, "created_at": record["created_at"]}
    entry_namespace = _memory_index_entry_namespace(namespace, entry)

    store.put(namespace, key, dict(record))
    store.put(
        entry_namespace,
        MEMORY_INDEX_KEY,
        dict(entry),
        index=False,
    )


def _recall_namespace(
    store: BaseStore, namespace: tuple[str, ...], *, limit: int
) -> list[MemoryRecord]:
    if limit <= 0:
        return []

    entries = _read_memory_index_entries(store, namespace, limit=limit)
    if entries:
        items = [
            item
            for entry in entries[:limit]
            if (item := store.get(namespace, entry["key"])) is not None
        ]
    else:
        items = store.search(namespace, limit=limit)

    return [
        record
        for record in (_parse_memory_record(item.value) for item in items)
        if record is not None
    ]


def _memory_index_entries_namespace(namespace: tuple[str, ...]) -> tuple[str, ...]:
    return (*_memory_index_namespace(namespace), "entries")


def _memory_index_entry_namespace(
    namespace: tuple[str, ...], entry: MemoryIndexEntry
) -> tuple[str, ...]:
    created_at = datetime.fromisoformat(entry["created_at"])
    if created_at.tzinfo is None:
        raise ValueError("memory created_at must include a timezone")

    elapsed = created_at.astimezone(UTC) - _UNIX_EPOCH
    timestamp_microseconds = (
        elapsed.days * 86_400_000_000 + elapsed.seconds * 1_000_000 + elapsed.microseconds
    )
    reverse_timestamp = _MEMORY_INDEX_TIMESTAMP_CEILING_MICROSECONDS - timestamp_microseconds
    if timestamp_microseconds < 0 or reverse_timestamp < 0:
        raise ValueError("memory created_at is outside the supported range")

    sort_key = f"{reverse_timestamp:018d}-{entry['key']}"
    return (*_memory_index_entries_namespace(namespace), sort_key)


def _read_memory_index_entries(
    store: BaseStore, namespace: tuple[str, ...], *, limit: int
) -> list[MemoryIndexEntry]:
    entries_namespace = _memory_index_entries_namespace(namespace)
    entry_namespaces = store.list_namespaces(
        prefix=entries_namespace,
        max_depth=len(entries_namespace) + 1,
        limit=limit,
    )
    entries = [
        entry
        for entry_namespace in entry_namespaces
        if (item := store.get(entry_namespace, MEMORY_INDEX_KEY)) is not None
        if (entry := _parse_memory_index_entry(item.value)) is not None
    ]

    # Read the former single-document index during its TTL window so deployments
    # can move to append-only entries without losing existing memories.
    legacy_item = store.get(_memory_index_namespace(namespace), MEMORY_INDEX_KEY)
    if legacy_item is not None:
        entries.extend(_parse_memory_index(legacy_item.value)[:limit])

    by_key = {entry["key"]: entry for entry in entries}
    return sorted(by_key.values(), key=lambda entry: entry["created_at"], reverse=True)[:limit]


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


def _parse_memory_index_entry(value: Mapping[str, object]) -> MemoryIndexEntry | None:
    key = value.get("key")
    created_at = value.get("created_at")
    if not isinstance(key, str) or not isinstance(created_at, str):
        return None
    return {"key": key, "created_at": created_at}


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
