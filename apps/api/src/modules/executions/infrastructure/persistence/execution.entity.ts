import type { ExecutionStatus } from '@alfred/contracts';
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ConversationEntity } from '../../../conversations/infrastructure/persistence/conversation.entity';

/** One submitted chat request above its runtime invocations (ALF-DEC-033). */
@Entity({ name: 'api_executions' })
@Check(
  'chk_executions_status',
  `"status" IN ('pending', 'running', 'recovering', 'stopping', 'interrupted', 'recovery_required', 'completed', 'failed', 'cancelled', 'timed_out')`,
)
// (conversation_id, created_at DESC) is created by the migration; declared for drift checks only.
@Check('chk_executions_counters', '"lease_version" >= 0 AND "projection_revision" >= 0')
@Check(
  'chk_executions_dispatch_state',
  `"dispatch_state" IN ('pending', 'dispatching', 'accepted', 'unknown')`,
)
@Index('idx_executions_conversation', { synchronize: false })
@Index('uq_executions_submission', ['conversationId', 'submissionId'], { unique: true })
@Index('uq_executions_invocation', ['invocationId'], { unique: true })
@Index('uq_executions_active_conversation', { synchronize: false })
@Index('idx_executions_recovery', { synchronize: false })
export class ExecutionEntity {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_executions' })
  id!: string;

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId!: string;

  @ManyToOne(() => ConversationEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id', foreignKeyConstraintName: 'fk_executions_conversation' })
  conversation!: ConversationEntity;

  @Column({ type: 'varchar', length: 32, default: 'pending' })
  status!: ExecutionStatus;

  @Column({ name: 'owner_user_id', type: 'uuid' })
  ownerUserId!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ name: 'submission_id', type: 'uuid' })
  submissionId!: string;

  @Column({ name: 'submission_hash', type: 'varchar', length: 64 })
  submissionHash!: string;

  @Column({ name: 'response_profile', type: 'varchar', length: 96 })
  responseProfile!: string;

  @Column({ name: 'invocation_id', type: 'uuid' })
  invocationId!: string;

  @Column({ name: 'binding_generation', type: 'uuid' })
  bindingGeneration!: string;

  @Column({ name: 'dispatch_state', type: 'varchar', length: 16, default: 'pending' })
  dispatchState!: 'pending' | 'dispatching' | 'accepted' | 'unknown';

  @Column({ name: 'stop_requested_at', type: 'timestamptz', nullable: true })
  stopRequestedAt!: Date | null;

  @Column({ name: 'deadline_at', type: 'timestamptz' })
  deadlineAt!: Date;

  @Column({ name: 'lease_owner', type: 'varchar', length: 128, nullable: true })
  leaseOwner!: string | null;

  @Column({ name: 'lease_version', type: 'integer', default: 0 })
  leaseVersion!: number;

  @Column({ name: 'lease_expires_at', type: 'timestamptz', nullable: true })
  leaseExpiresAt!: Date | null;

  @Column({ name: 'next_attempt_at', type: 'timestamptz', default: () => 'now()' })
  nextAttemptAt!: Date;

  @Column({ name: 'source_watermark', type: 'varchar', length: 256, nullable: true })
  sourceWatermark!: string | null;

  @Column({ name: 'projection_revision', type: 'integer', default: 0 })
  projectionRevision!: number;

  @Column({ name: 'reducer_state', type: 'jsonb', default: {} })
  reducerState!: Record<string, unknown>;

  @Column({ name: 'public_text', type: 'text', default: '' })
  publicText!: string;

  @Column({ name: 'title_requested', type: 'boolean', default: false })
  titleRequested!: boolean;

  // Private runtime identifiers; never part of the public DTO (ALF-DEC-032 §5).
  @Column({ name: 'runtime_thread_id', type: 'varchar', length: 128, nullable: true })
  runtimeThreadId!: string | null;

  @Column({ name: 'runtime_run_id', type: 'varchar', length: 128, nullable: true })
  runtimeRunId!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  error!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt!: Date | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
