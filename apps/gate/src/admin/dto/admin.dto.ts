import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreditPack, StoragePack, SubscriptionTier } from '@archeon-org/types';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

const subscriptionTiers = Object.values(SubscriptionTier);
const creditPackValues = Object.values(CreditPack);
const storagePackValues = Object.values(StoragePack);

export class UpgradeTierDto {
  @ApiProperty({
    description: 'Target subscription tier',
    enum: subscriptionTiers,
  })
  @IsIn(subscriptionTiers)
  tier: SubscriptionTier;
}

export class AddCreditsPackDto {
  @ApiProperty({
    description: 'Credit pack key',
    enum: creditPackValues,
  })
  @IsIn(creditPackValues)
  pack: CreditPack;
}

export class AddCustomCreditsDto {
  @ApiProperty({
    description: 'Credits to set',
    example: 5000,
    minimum: 0,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  credits: number;

  @ApiPropertyOptional({
    description: 'Bonus searches to set',
    example: 10,
    minimum: 0,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  bonusSearches?: number;

  @ApiPropertyOptional({
    description: 'Reason for adjustment',
    example: 'Admin adjustment',
    default: 'Admin adjustment',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class SetBonusSearchesDto {
  @ApiProperty({
    description: 'Bonus searches to set',
    example: 25,
    minimum: 0,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  bonusSearches: number;

  @ApiPropertyOptional({
    description: 'Reason for adjustment',
    example: 'Admin adjustment',
    default: 'Admin adjustment',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class SetStoragePackDto {
  @ApiProperty({
    description: 'Storage pack key',
    enum: storagePackValues,
  })
  @IsIn(storagePackValues)
  pack: StoragePack;
}

export class SetCustomStorageDto {
  @ApiProperty({
    description: 'Storage in gigabytes',
    example: 200,
    minimum: 0,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  storageGb: number;

  @ApiPropertyOptional({
    description: 'Reason for adjustment',
    example: 'Admin adjustment',
    default: 'Admin adjustment',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class TriggerRagBackfillDto {
  @ApiPropertyOptional({
    description: 'Number of documents processed per batch',
    example: 100,
    default: 100,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  batchSize?: number;

  @ApiPropertyOptional({
    description: 'Identifier of the requester',
    example: 'admin',
    default: 'admin',
  })
  @IsOptional()
  @IsString()
  requestedBy?: string;
}
