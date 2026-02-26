from enum import Enum

from sqlalchemy import text
from sqlalchemy.orm import Session

from core.logging import get_logger

logger = get_logger(__name__)


class CreditOperation(str, Enum):
    AI_CLASSIFICATION = "AI_CLASSIFICATION"
    AI_TITLE_GENERATION = "AI_TITLE_GENERATION"
    AI_EMBEDDING = "AI_EMBEDDING"


CREDIT_COSTS: dict[CreditOperation, int] = {
    CreditOperation.AI_CLASSIFICATION: 5,
    CreditOperation.AI_TITLE_GENERATION: 2,
    CreditOperation.AI_EMBEDDING: 1,
}


class CreditService:
    def refund_credits(
        self,
        session: Session,
        user_id: str,
        operation: CreditOperation,
        reason: str,
    ) -> int:
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


_credit_service: CreditService | None = None


def get_credit_service() -> CreditService:
    global _credit_service
    if _credit_service is None:
        _credit_service = CreditService()
    return _credit_service
