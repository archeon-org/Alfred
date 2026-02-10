"""
R2 Service

Cloudflare R2 (S3-compatible) storage operations.
"""

from io import BytesIO
from typing import BinaryIO

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from core.config import get_settings
from core.logging import get_logger

logger = get_logger(__name__)


class R2Service:
    """Service for interacting with Cloudflare R2 storage."""

    def __init__(self) -> None:
        settings = get_settings()
        r2_settings = settings.r2

        self._client = boto3.client(
            "s3",
            endpoint_url=r2_settings.endpoint_url,
            aws_access_key_id=r2_settings.access_key_id.get_secret_value(),
            aws_secret_access_key=r2_settings.secret_access_key.get_secret_value(),
            config=Config(
                signature_version="s3v4",
                retries={"max_attempts": 3, "mode": "adaptive"},
            ),
            region_name="auto",
        )
        self._bucket_name = r2_settings.bucket_name
        logger.info("R2 service initialized", bucket=self._bucket_name)

    def get_file(self, key: str) -> bytes:
        """
        Download a file from R2.

        Args:
            key: Object key in the bucket

        Returns:
            File contents as bytes

        Raises:
            ClientError: If download fails
        """
        try:
            response = self._client.get_object(Bucket=self._bucket_name, Key=key)
            data = response["Body"].read()
            logger.debug("Downloaded file from R2", key=key, size=len(data))
            return data
        except ClientError as e:
            logger.error("Failed to download file from R2", key=key, error=str(e))
            raise

    def upload_file(
        self,
        key: str,
        data: bytes | BinaryIO,
        content_type: str = "application/octet-stream",
    ) -> None:
        """
        Upload a file to R2.

        Args:
            key: Object key in the bucket
            data: File contents
            content_type: MIME type

        Raises:
            ClientError: If upload fails
        """
        try:
            if isinstance(data, bytes):
                data = BytesIO(data)

            self._client.upload_fileobj(
                data,
                self._bucket_name,
                key,
                ExtraArgs={"ContentType": content_type},
            )
            logger.info("Uploaded file to R2", key=key)
        except ClientError as e:
            logger.error("Failed to upload file to R2", key=key, error=str(e))
            raise

    def delete_file(self, key: str) -> None:
        """
        Delete a file from R2.

        Args:
            key: Object key in the bucket

        Raises:
            ClientError: If deletion fails
        """
        try:
            self._client.delete_object(Bucket=self._bucket_name, Key=key)
            logger.info("Deleted file from R2", key=key)
        except ClientError as e:
            logger.error("Failed to delete file from R2", key=key, error=str(e))
            raise

    def generate_presigned_url(self, key: str, expires_in: int = 3600) -> str:
        """
        Generate a presigned URL for downloading a file.

        Args:
            key: Object key in the bucket
            expires_in: URL expiration time in seconds

        Returns:
            Presigned URL string

        Raises:
            ClientError: If URL generation fails
        """
        try:
            url = self._client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self._bucket_name, "Key": key},
                ExpiresIn=expires_in,
            )
            return url
        except ClientError as e:
            logger.error("Failed to generate presigned URL", key=key, error=str(e))
            raise

    def file_exists(self, key: str) -> bool:
        """
        Check if a file exists in R2.

        Args:
            key: Object key in the bucket

        Returns:
            True if file exists, False otherwise
        """
        try:
            self._client.head_object(Bucket=self._bucket_name, Key=key)
            return True
        except ClientError:
            return False


# Singleton instance
_r2_service: R2Service | None = None


def get_r2_service() -> R2Service:
    """Get or create R2 service singleton."""
    global _r2_service
    if _r2_service is None:
        _r2_service = R2Service()
    return _r2_service
