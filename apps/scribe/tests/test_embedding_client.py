from __future__ import annotations

import base64
import struct
from types import SimpleNamespace

import pytest

from rag.embedding_client import RagEmbeddingClient


def _client(dimensions: int) -> RagEmbeddingClient:
    client = RagEmbeddingClient.__new__(RagEmbeddingClient)
    client._embedding_dimensions = dimensions
    return client


def test_normalize_embedding_accepts_json_array_string() -> None:
    client = _client(dimensions=3)
    vector = client._normalize_embedding("[1.0, 2, -3.5]", 0)
    assert vector == [1.0, 2.0, -3.5]


def test_normalize_embedding_accepts_base64_payload() -> None:
    client = _client(dimensions=3)
    raw = struct.pack("<3f", 0.5, -1.25, 3.0)
    encoded = base64.b64encode(raw).decode("ascii")

    vector = client._normalize_embedding(encoded, 0)
    assert vector == pytest.approx([0.5, -1.25, 3.0], rel=1e-6)


def test_normalize_embedding_rejects_invalid_string() -> None:
    client = _client(dimensions=3)
    with pytest.raises(ValueError, match="neither a JSON array nor valid base64"):
        client._normalize_embedding("not-a-vector", 0)


@pytest.mark.asyncio
async def test_embed_texts_requests_float_encoding_and_normalizes() -> None:
    class DummyEmbeddings:
        def __init__(self) -> None:
            self.kwargs: dict[str, object] = {}

        async def create(self, **kwargs):
            self.kwargs = kwargs
            return SimpleNamespace(data=[SimpleNamespace(embedding="[0.1, 0.2]")])

    dummy_embeddings = DummyEmbeddings()
    client = _client(dimensions=2)
    client._client = SimpleNamespace(embeddings=dummy_embeddings)
    client._embedding_model = "test-embedding-model"

    vectors = await client.embed_texts(user_id="user-1", texts=["hello"])

    assert vectors == [[0.1, 0.2]]
    assert dummy_embeddings.kwargs["encoding_format"] == "float"
