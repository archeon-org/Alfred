"""
Notification Service

Send notifications to users (in-app and push via Expo Push API).
"""

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any
from uuid import uuid4

import httpx
from sqlalchemy import text
from sqlalchemy.orm import Session

from core.logging import get_logger

logger = get_logger(__name__)

# Expo Push API constants
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
EXPO_PUSH_TOKEN_PATTERN = re.compile(r"^ExponentPushToken\[.+\]$|^ExpoPushToken\[.+\]$")


class NotificationType(str, Enum):
    """Types of notifications matching the TypeScript enum."""

    DOCUMENT_CLASSIFIED = "document_classified"
    DOCUMENT_ERROR = "document_error"
    TITLE_GENERATED = "title_generated"
    SEARCH_ENABLED = "search_enabled"
    SYSTEM = "system"


@dataclass
class CreateNotificationDTO:
    """Data for creating a notification."""

    user_id: str
    title: str
    message: str
    redirect: str | None = None
    notification_type: NotificationType = NotificationType.SYSTEM
    data: dict[str, Any] = field(default_factory=dict)


def is_expo_push_token(token: str | None) -> bool:
    """Validate if a string is a valid Expo push token."""
    if not token:
        return False
    return bool(EXPO_PUSH_TOKEN_PATTERN.match(token))


class NotificationService:
    """Service for creating user notifications and sending push notifications."""

    def __init__(self) -> None:
        """Initialize notification service with HTTP client."""
        self._http_client: httpx.Client | None = None

    @property
    def http_client(self) -> httpx.Client:
        """Get or create HTTP client for Expo Push API."""
        if self._http_client is None:
            self._http_client = httpx.Client(
                timeout=30.0,
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "Accept-Encoding": "gzip, deflate",
                },
            )
        return self._http_client

    def create(
        self,
        session: Session,
        dto: CreateNotificationDTO,
    ) -> str | None:
        """
        Create a notification for a user and send push notification.

        Args:
            session: Database session
            dto: Notification data

        Returns:
            Created notification ID or None if skipped
        """
        logger.info(
            "Creating notification",
            user_id=dto.user_id,
            title=dto.title,
            notification_type=dto.notification_type.value,
        )

        # Fetch user with pushToken
        user_result = session.execute(
            text('SELECT id, preferences, "pushToken" FROM users WHERE id = :user_id'),
            {"user_id": dto.user_id},
        ).fetchone()

        if not user_result:
            logger.warning("User not found, skipping notification", user_id=dto.user_id)
            return None

        user_id, preferences, push_token = user_result
        preferences = preferences or {}

        # Check if user has disabled this notification type
        if not self._should_send_notification(preferences, dto.notification_type):
            logger.debug(
                "User has disabled notification type",
                user_id=dto.user_id,
                notification_type=dto.notification_type.value,
            )
            return None

        # Create notification in database
        notification_id = str(uuid4())
        session.execute(
            text("""
                INSERT INTO notifications (id, "userId", title, message, redirect, "isRead", "createdAt")
                VALUES (:id, :user_id, :title, :message, :redirect, false, NOW())
            """),
            {
                "id": notification_id,
                "user_id": dto.user_id,
                "title": dto.title,
                "message": dto.message,
                "redirect": dto.redirect,
            },
        )
        session.commit()

        logger.info("Created notification in database", notification_id=notification_id)

        # Send push notification
        notification_data = {
            **(dto.data or {}),
            "notificationId": notification_id,
        }
        self._send_push_notification(
            push_token=push_token,
            title=dto.title,
            body=dto.message,
            data=notification_data,
            user_id=dto.user_id,
        )

        return notification_id

    def _send_push_notification(
        self,
        push_token: str | None,
        title: str,
        body: str,
        data: dict[str, Any],
        user_id: str,
    ) -> None:
        """
        Send push notification via Expo Push API.

        Args:
            push_token: User's Expo push token
            title: Notification title
            body: Notification body/message
            data: Additional data payload
            user_id: User ID for logging
        """
        if not push_token:
            logger.info("User does not have a push token, skipping push", user_id=user_id)
            return

        if not is_expo_push_token(push_token):
            logger.warning(
                "Invalid Expo push token format",
                user_id=user_id,
                token=push_token[:20] + "..." if len(push_token) > 20 else push_token,
            )
            return

        message = {
            "to": push_token,
            "sound": "default",
            "title": title,
            "body": body,
            "data": data,
            "priority": "high",
            "channelId": "default",
        }

        logger.info(
            "Sending push notification",
            user_id=user_id,
            title=title,
        )

        try:
            response = self.http_client.post(EXPO_PUSH_URL, json=message)
            response.raise_for_status()
            result = response.json()

            # Check for push ticket errors
            if "data" in result:
                ticket = result["data"]
                if ticket.get("status") == "ok":
                    logger.info(
                        "Push notification sent successfully",
                        user_id=user_id,
                        ticket_id=ticket.get("id"),
                    )
                else:
                    logger.warning(
                        "Push notification ticket error",
                        user_id=user_id,
                        status=ticket.get("status"),
                        message=ticket.get("message"),
                        details=ticket.get("details"),
                    )
            else:
                logger.info("Push notification response", user_id=user_id, result=result)

        except httpx.HTTPStatusError as e:
            logger.error(
                "HTTP error sending push notification",
                user_id=user_id,
                status_code=e.response.status_code,
                error=str(e),
            )
        except httpx.RequestError as e:
            logger.error(
                "Request error sending push notification",
                user_id=user_id,
                error=str(e),
            )

    def _should_send_notification(
        self,
        preferences: dict[str, Any],
        notification_type: NotificationType,
    ) -> bool:
        """Check if notification should be sent based on user preferences."""
        # Default to enabled if not specified
        push_prefs = preferences.get("pushNotifications", {})

        # Map notification types to preference keys
        type_to_pref = {
            NotificationType.DOCUMENT_CLASSIFIED: "documentProcessed",
            NotificationType.DOCUMENT_ERROR: "processingError",
            NotificationType.TITLE_GENERATED: "documentProcessed",
            NotificationType.SEARCH_ENABLED: "documentProcessed",
            NotificationType.SYSTEM: "systemAlerts",
        }

        pref_key = type_to_pref.get(notification_type, "systemAlerts")
        return push_prefs.get(pref_key, True)


# Singleton instance
_notification_service: NotificationService | None = None


def get_notification_service() -> NotificationService:
    """Get or create notification service singleton."""
    global _notification_service
    if _notification_service is None:
        _notification_service = NotificationService()
    return _notification_service
