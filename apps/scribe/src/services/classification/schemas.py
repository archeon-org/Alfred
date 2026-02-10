"""
Classification Schemas and Constants

Single Responsibility: Define static data for classification.
"""


class ClassificationConstants:
    """Static constants for classification."""

    # Maximum content length for API calls
    MAX_CONTENT_CHARS = 8000
    MAX_TITLE_CONTENT_CHARS = 4000

    # Title constraints
    MAX_TITLE_LENGTH = 60
    MAX_CATEGORY_NAME_LENGTH = 25

    # Available icons for category creation (Ionicons)
    AVAILABLE_ICONS = [
        "document-outline",
        "folder-outline",
        "receipt-outline",
        "cash-outline",
        "card-outline",
        "wallet-outline",
        "briefcase-outline",
        "medkit-outline",
        "heart-outline",
        "car-outline",
        "airplane-outline",
        "home-outline",
        "business-outline",
        "school-outline",
        "book-outline",
        "mail-outline",
        "people-outline",
        "id-card-outline",
        "calendar-outline",
        "clipboard-outline",
    ]

    # Available colors for category creation (hex codes)
    AVAILABLE_COLORS = [
        "#EF4444",
        "#F97316",
        "#F59E0B",
        "#84CC16",
        "#22C55E",
        "#10B981",
        "#06B6D4",
        "#3B82F6",
        "#6366F1",
        "#8B5CF6",
        "#A855F7",
        "#EC4899",
    ]

    # Default values
    DEFAULT_ICON = "folder-outline"
    DEFAULT_COLOR = "#3B82F6"
    DEFAULT_TITLE = "Untitled Document"


# JSON Schema for classification response (for reference/validation)
CLASSIFICATION_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "categoryId": {
            "type": ["string", "null"],
            "description": "The ID of the best matching existing category, or null for new category",
        },
        "newCategory": {
            "type": ["object", "null"],
            "properties": {
                "name": {"type": "string", "maxLength": 25},
                "icon": {"type": "string"},
                "color": {"type": "string", "pattern": "^#[0-9A-Fa-f]{6}$"},
            },
            "required": ["name", "icon", "color"],
        },
        "tagIds": {
            "type": "array",
            "items": {"type": "string"},
        },
        "title": {
            "type": "string",
            "maxLength": 60,
        },
        "confidence": {
            "type": "string",
            "enum": ["high", "medium", "low"],
        },
        "reasoning": {
            "type": "string",
        },
    },
    "required": ["categoryId", "newCategory", "tagIds", "title", "confidence", "reasoning"],
}

TITLE_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {
            "type": "string",
            "maxLength": 60,
            "description": "A concise, descriptive title for the document",
        },
    },
    "required": ["title"],
}
