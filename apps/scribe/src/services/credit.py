"""
Credit Service

Manage user credits (refunds for failed operations).
"""

from enum import Enum

from sqlalchemy import text
from sqlalchemy.orm import Session

from core.logging import get_logger

logger = get_logger(__name__)


class CreditOperation(str, Enum):
    """Credit operations matching the TypeScript enum."""

    AI_CLASSIFICATION = "AI_CLASSIFICATION"
    AI_TITLE_GENERATION = "AI_TITLE_GENERATION"
    AI_EMBEDDING = "AI_EMBEDDING"


# Credit costs for each operation (must match TypeScript CREDIT_COSTS)
CREDIT_COSTS: dict[CreditOperation, int] = {
    CreditOperation.AI_CLASSIFICATION: 5,
    CreditOperation.AI_TITLE_GENERATION: 2,
    CreditOperation.AI_EMBEDDING: 1,
}


class CreditService:
    """Service for managing user credits."""

    def refund_credits(
        self,
        session: Session,
        user_id: str,
        operation: CreditOperation,
        reason: str,
    ) -> int:
        """
        Refund credits to a user when an operation fails.

        Args:
            session: Database session
            user_id: User UUID
            operation: The operation that failed
            reason: Reason for refund

        Returns:
            New credit balance
        """
        cost = CREDIT_COSTS[operation]

        logger.info(
            "Refunding credits",
            user_id=user_id,
            operation=operation.value,
            amount=cost,
            reason=reason,
        )

        result = session.execute(
            text("""
                UPDATE users
                SET credits = credits + :amount
                WHERE id = :user_id
                RETURNING credits
            """),
            {"amount": cost, "user_id": user_id},
        )

        row = result.fetchone()
        if not row:
            logger.warning("User not found for credit refund", user_id=user_id)
            return 0

        new_balance = row[0]
        session.commit()

        logger.info(
            "Credits refunded",
            user_id=user_id,
            amount=cost,
            new_balance=new_balance,
        )

        return new_balance

    def add_credits(
        self,
        session: Session,
        user_id: str,
        amount: int,
        reason: str,
    ) -> int:
        """
        Add credits to a user account.

        Args:
            session: Database session
            user_id: User UUID
            amount: Credits to add
            reason: Reason for addition

        Returns:
            New credit balance
        """
        logger.info(
            "Adding credits",
            user_id=user_id,
            amount=amount,
            reason=reason,
        )

        result = session.execute(
            text("""
                UPDATE users
                SET credits = credits + :amount
                WHERE id = :user_id
                RETURNING credits
            """),
            {"amount": amount, "user_id": user_id},
        )

        row = result.fetchone()
        if not row:
            logger.warning("User not found for credit addition", user_id=user_id)
            return 0

        new_balance = row[0]
        session.commit()

        logger.info(
            "Credits added",
            user_id=user_id,
            amount=amount,
            new_balance=new_balance,
        )

        return new_balance


# Singleton instance
_credit_service: CreditService | None = None


def get_credit_service() -> CreditService:
    """Get or create credit service singleton."""
    global _credit_service
    if _credit_service is None:
        _credit_service = CreditService()
    return _credit_service
