"""
Text Quality Checker

Single Responsibility: Determine if extracted text meets quality thresholds.
KISS: Simple density-based heuristics.
"""


class TextQualityChecker:
    """
    Validates text extraction quality using density heuristics.

    Single Responsibility: Only checks text quality, no extraction logic.
    """

    def __init__(
        self,
        min_length: int = 50,
        min_density: float = 0.1,
        min_meaningful_lines: int = 3,
    ):
        self._min_length = min_length
        self._min_density = min_density
        self._min_meaningful_lines = min_meaningful_lines

    def is_successful(self, text: str) -> bool:
        """
        Check if text extraction was successful.

        Criteria:
        - Minimum total length
        - Minimum alphanumeric character density
        - Minimum number of lines with meaningful content

        Args:
            text: Extracted text to evaluate

        Returns:
            True if text meets quality thresholds
        """
        if not text or len(text) < self._min_length:
            return False

        # Calculate alphanumeric density
        alphanumeric_count = sum(1 for c in text if c.isalnum())
        density = alphanumeric_count / len(text)

        if density < self._min_density:
            return False

        # Count lines with at least 3 alphanumeric characters
        meaningful_lines = sum(
            1 for line in text.split("\n") if sum(1 for c in line if c.isalnum()) >= 3
        )

        return meaningful_lines >= self._min_meaningful_lines
