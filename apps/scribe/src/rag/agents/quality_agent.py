from __future__ import annotations

from core.logging import get_logger
from rag.types import ChunkForIndexing

logger = get_logger(__name__)


class QualityAgent:
    def assess(
        self,
        *,
        chunks: list[ChunkForIndexing],
        upserted: int,
        skipped: int,
        deleted: int,
    ) -> dict[str, int | bool]:
        zero_indexed = len(chunks) == 0
        low_coverage = len(chunks) > 0 and (upserted + skipped) == 0
        status = not zero_indexed and not low_coverage

        logger.info(
            "Quality check complete",
            total_chunks=len(chunks),
            upserted=upserted,
            skipped=skipped,
            deleted=deleted,
            status=status,
        )

        return {
            "status": status,
            "total_chunks": len(chunks),
            "upserted": upserted,
            "skipped": skipped,
            "deleted": deleted,
            "zero_indexed": zero_indexed,
            "low_coverage": low_coverage,
        }
