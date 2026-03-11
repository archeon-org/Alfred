import { ApiProperty } from '@nestjs/swagger';
import { CreditOperation, SubscriptionTier } from '@archeon-org/types';
import { IsIn } from 'class-validator';

const creditOperations = Object.values(CreditOperation);
const subscriptionTiers = Object.values(SubscriptionTier);

export class CheckCreditsDto {
  @ApiProperty({
    description: 'Type of operation to check',
    enum: creditOperations,
  })
  @IsIn(creditOperations)
  operation: CreditOperation;
}

export class UpgradeSubscriptionDto {
  @ApiProperty({
    description: 'Target subscription tier',
    enum: subscriptionTiers,
  })
  @IsIn(subscriptionTiers)
  tier: SubscriptionTier;
}
