import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UserEntity } from "@archeon-org/database";
import { CreditOperation, CREDIT_COSTS } from "@archeon-org/types";

@Injectable()
export class CreditService {
  private readonly logger = new Logger(CreditService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>
  ) {}

  /**
   * Refund credits to a user when a job fails
   * This is used by the scribe service when document processing fails
   */
  async refundCredits(
    userId: string,
    operation: CreditOperation,
    reason: string
  ): Promise<number> {
    const cost = CREDIT_COSTS[operation];

    const result = await this.userRepository
      .createQueryBuilder()
      .update(UserEntity)
      .set({
        credits: () => `credits + ${cost}`,
      })
      .where("id = :userId", { userId })
      .returning(["credits"])
      .execute();

    if (result.affected === 0) {
      this.logger.warn(
        `Failed to refund credits for user ${userId}: user not found`
      );
      return 0;
    }

    const newCredits = result.raw[0]?.credits ?? 0;

    this.logger.log(
      `Refunded ${cost} credits to user ${userId} for failed ${operation} (${reason}). New balance: ${newCredits}`
    );

    return newCredits;
  }

  /**
   * Add credits to a user (for purchases, refunds, or admin adjustments)
   */
  async addCredits(
    userId: string,
    amount: number,
    reason: string
  ): Promise<number> {
    const result = await this.userRepository
      .createQueryBuilder()
      .update(UserEntity)
      .set({
        credits: () => `credits + ${amount}`,
      })
      .where("id = :userId", { userId })
      .returning(["credits"])
      .execute();

    if (result.affected === 0) {
      this.logger.warn(
        `Failed to add credits for user ${userId}: user not found`
      );
      return 0;
    }

    const newCredits = result.raw[0]?.credits ?? 0;

    this.logger.log(
      `User ${userId} received ${amount} credits (${reason}). New balance: ${newCredits}`
    );

    return newCredits;
  }
}
