from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Neo4jSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="NEO4J_",
        extra="ignore",
    )

    uri: str = Field(
        default="bolt://localhost:7687",
        description="Neo4j connection URI (bolt:// or neo4j://)",
    )
    user: str = Field(default="neo4j", description="Neo4j username")
    password: SecretStr = Field(default=SecretStr("password"), description="Neo4j password")


class OpenAISettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="OPENAI_",
        extra="ignore",
    )

    api_key: SecretStr = Field(..., description="OpenAI API key")
    model: str = Field(
        default="gpt-4o-mini",
        description="LLM model for extraction/summarization",
    )
    embedding_model: str = Field(
        default="text-embedding-3-small",
        description="Embedding model for vector search",
    )
    base_url: str | None = Field(
        default=None,
        description="Custom base URL for OpenAI-compatible APIs",
    )
    embedding_dim: int = Field(
        default=1536,
        description="Embedding dimensions (for models that support variable dimensions)",
    )


class GraphitiSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="GRAPHITI_",
        extra="ignore",
    )

    enabled: bool = Field(
        default=True,
        description="Enable/disable Graphiti knowledge graph features",
    )
    store_raw_content: bool = Field(
        default=True,
        description="Store raw episode content in the graph",
    )
    max_coroutines: int = Field(
        default=10,
        ge=1,
        le=50,
        description="Maximum concurrent operations for bulk processing",
    )
    search_limit: int = Field(
        default=10,
        ge=1,
        le=100,
        description="Default number of search results to return",
    )

    neo4j: Neo4jSettings = Field(default_factory=Neo4jSettings)
    openai: OpenAISettings = Field(default_factory=OpenAISettings)  # type: ignore[arg-type]


@lru_cache
def get_graphiti_settings() -> GraphitiSettings:
    return GraphitiSettings()
