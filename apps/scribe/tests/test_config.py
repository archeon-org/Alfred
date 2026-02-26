"""
Tests for Configuration
"""

import os
from unittest.mock import patch


class TestSettings:
    """Test cases for configuration settings."""

    def test_database_url_generation(self):
        """Test database URL is generated correctly."""
        with patch.dict(
            os.environ,
            {
                "DATABASE_HOST": "testhost",
                "DATABASE_PORT": "5433",
                "DATABASE_NAME": "testdb",
                "DATABASE_USERNAME": "testuser",
                "DATABASE_PASSWORD": "testpass",
                "DATABASE_SSL": "false",
                "REDIS_HOST": "localhost",
                "REDIS_PORT": "6379",
                "REDIS_PASSWORD": "redispass",
                "R2_ACCOUNT_ID": "test",
                "R2_ACCESS_KEY_ID": "key",
                "R2_SECRET_ACCESS_KEY": "secret",
                "R2_BUCKET_NAME": "bucket",
                "FIREWORKS_API_KEY": "apikey",
            },
        ):
            from core.config import DatabaseSettings

            db_settings = DatabaseSettings()

            assert db_settings.host == "testhost"
            assert db_settings.port == 5433
            assert db_settings.name == "testdb"
            assert db_settings.username == "testuser"
            assert "testpass" in db_settings.url
            assert "postgresql://" in db_settings.url

    def test_redis_url_generation(self):
        """Test Redis URL is generated correctly."""
        with patch.dict(
            os.environ,
            {
                "REDIS_HOST": "redishost",
                "REDIS_PORT": "6380",
                "REDIS_PASSWORD": "secret123",
                "REDIS_DB": "1",
                "REDIS_SSL": "false",
            },
        ):
            from core.config import RedisSettings

            redis_settings = RedisSettings()

            assert redis_settings.host == "redishost"
            assert redis_settings.port == 6380
            assert redis_settings.db == 1
            assert "redis://" in redis_settings.url
            assert "secret123" in redis_settings.url

    def test_production_detection(self):
        """Test production environment detection."""
        with patch.dict(
            os.environ,
            {
                "ENV": "production",
                "DATABASE_PASSWORD": "pass",
                "REDIS_PASSWORD": "pass",
                "R2_ACCOUNT_ID": "test",
                "R2_ACCESS_KEY_ID": "key",
                "R2_SECRET_ACCESS_KEY": "secret",
                "R2_BUCKET_NAME": "bucket",
                "FIREWORKS_API_KEY": "apikey",
            },
        ):
            # Clear cached settings
            from core.config import get_settings

            get_settings.cache_clear()

            settings = get_settings()
            assert settings.is_production is True

            # Reset cache
            get_settings.cache_clear()
