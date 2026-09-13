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
  `"status" IN ('pending', 'running', 'completed', 'failed', 'cancelled')`,
)
// (conversation_id, created_at DESC) is created by the migration; declared for drift checks only.
@Index('idx_executions_conversation', { synchronize: false })
export class ExecutionEntity {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_executions' })
  id!: string;

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId!: string;

  @ManyToOne(() => ConversationEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id', foreignKeyConstraintName: 'fk_executions_conversation' })
  conversation!: ConversationEntity;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: ExecutionStatus;

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
