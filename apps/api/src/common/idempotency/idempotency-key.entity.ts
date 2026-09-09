import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { UserEntity } from '../../modules/users/user.entity';

@Entity({ name: 'api_idempotency_keys' })
@Index('idx_idempotency_keys_expiry', ['expiresAt'])
@Check('chk_idempotency_keys_key', `"key" ~ '^[A-Za-z0-9_-]{1,128}$'`)
@Check('chk_idempotency_keys_hash', `"request_hash" ~ '^[a-f0-9]{64}$'`)
@Check(
  'chk_idempotency_keys_response',
  `(("response_status" IS NULL AND "response_body" IS NULL) OR ("response_status" IS NOT NULL AND "response_status" BETWEEN 200 AND 299 AND "response_body" IS NOT NULL)) AND "expires_at" = "created_at" + interval '24 hours'`,
)
export class IdempotencyKeyEntity {
  @PrimaryColumn({
    name: 'owner_user_id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_idempotency_keys',
  })
  ownerUserId!: string;

  @PrimaryColumn({ type: 'varchar', length: 128, primaryKeyConstraintName: 'pk_idempotency_keys' })
  key!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'owner_user_id', foreignKeyConstraintName: 'fk_idempotency_keys_owner' })
  owner!: UserEntity;

  // Fences a delayed completion from a later reservation of the same owner/key/hash.
  @Column({ name: 'reservation_id', type: 'uuid' })
  reservationId!: string;

  @Column({ name: 'request_hash', type: 'char', length: 64 })
  requestHash!: string;

  @Column({ name: 'response_status', type: 'smallint', nullable: true })
  responseStatus!: number | null;

  @Column({ name: 'response_body', type: 'jsonb', nullable: true })
  responseBody!: unknown;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  // All entries expire after 24h. Match TypeORM introspection, which strips the interval cast.
  // PostgreSQL resolves the literal to interval; the migration uses explicit interval syntax.
  @Column({
    name: 'expires_at',
    type: 'timestamptz',
    default: () => "(now() + '24:00:00')",
  })
  expiresAt!: Date;
}
