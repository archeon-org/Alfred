"""
Pipeline Package

Document processing pipelines following SOLID/SOC principles.
Each pipeline orchestrates services for a specific workflow.
"""

from pipelines.document import DocumentPipeline
from pipelines.title import TitlePipeline

__all__ = ["DocumentPipeline", "TitlePipeline"]
