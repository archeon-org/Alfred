from __future__ import annotations

import builtins
import sys
import types
from types import SimpleNamespace

import pytest

from services.chunking.chunker import DocumentChunker, should_chunk_document


def test_document_chunker_init_falls_back_when_chonkie_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    original_import = builtins.__import__

    def fake_import(name: str, *args, **kwargs):  # noqa: ANN002, ANN003
        if name == "chonkie":
            raise ImportError("missing")
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)
    chunker = DocumentChunker(chunk_size=120, min_chunk_size=20)

    assert chunker.chunker is None


def test_document_chunker_init_uses_chonkie_when_available(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeTokenChunker:
        def __init__(self, chunk_size: int, chunk_overlap: int) -> None:
            self.chunk_size = chunk_size
            self.chunk_overlap = chunk_overlap

        def chunk(self, text: str):  # noqa: ARG002
            return []

    fake_module = types.ModuleType("chonkie")
    fake_module.TokenChunker = FakeTokenChunker
    monkeypatch.setitem(sys.modules, "chonkie", fake_module)

    chunker = DocumentChunker(chunk_size=200, min_chunk_size=40)

    assert chunker.chunker is not None
    assert chunker.chunker.chunk_size == 200  # type: ignore[union-attr]
    assert chunker.chunker.chunk_overlap == 0  # type: ignore[union-attr]


def test_chunk_document_returns_empty_for_blank_input() -> None:
    chunker = DocumentChunker.__new__(DocumentChunker)
    chunker.chunk_size = 10
    chunker.min_chunk_size = 2
    chunker.chunker = None

    assert chunker.chunk_document("   \n\t", document_name="Doc", document_id="d1") == []


def test_chunk_document_returns_single_chunk_for_short_text() -> None:
    chunker = DocumentChunker(chunk_size=200, min_chunk_size=10)
    result = chunker.chunk_document(
        "Short text",
        document_name="Doc",
        document_id="doc-1",
    )

    assert len(result) == 1
    assert result[0].content == "Short text"
    assert result[0].part_name == "Part 1/1"
    assert result[0].metadata["document_name"] == "Doc"


def test_chunk_with_chonkie_filters_small_chunks_and_tracks_offsets() -> None:
    chunker = DocumentChunker.__new__(DocumentChunker)
    chunker.chunk_size = 80
    chunker.min_chunk_size = 5
    chunker.chunker = SimpleNamespace(
        chunk=lambda text: [  # noqa: ARG005
            SimpleNamespace(text="a"),
            SimpleNamespace(text="First valid chunk."),
            SimpleNamespace(text="Second valid chunk."),
        ]
    )

    text = "First valid chunk. Second valid chunk."
    chunks = chunker._chunk_with_chonkie(text)

    assert len(chunks) == 2
    assert chunks[0][0] == "First valid chunk."
    assert chunks[1][1] >= chunks[0][2]


def test_chunk_with_chonkie_falls_back_to_simple_on_exception() -> None:
    chunker = DocumentChunker.__new__(DocumentChunker)
    chunker.chunk_size = 80
    chunker.min_chunk_size = 5
    chunker.chunker = SimpleNamespace(
        chunk=lambda text: (_ for _ in ()).throw(RuntimeError("boom"))  # noqa: ARG005
    )

    chunker._chunk_simple = lambda text: [("fallback", 0, 8)]  # type: ignore[method-assign]
    result = chunker._chunk_with_chonkie("any text")

    assert result == [("fallback", 0, 8)]


def test_chunk_simple_splits_and_discards_small_segments() -> None:
    chunker = DocumentChunker.__new__(DocumentChunker)
    chunker.chunk_size = 45
    chunker.min_chunk_size = 15
    text = (
        "First sentence is long enough. Second sentence is also long enough and keeps going. Tiny."
    )

    chunks = chunker._chunk_simple(text)

    assert len(chunks) >= 1
    for content, start, end in chunks:
        assert len(content) >= 15
        assert 0 <= start < end <= len(text)


def test_should_chunk_document_uses_threshold() -> None:
    assert should_chunk_document("a" * 10001, threshold=10000) is True
    assert should_chunk_document("a" * 9999, threshold=10000) is False
