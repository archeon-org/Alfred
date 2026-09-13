import type { MessageRole } from '@alfred/contracts';
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ConversationEntity } from '../../../conversations/infrastructure/persistence/conversation.entity';
import { ExecutionEntity } from './execution.entity';

/** Visible transcript turn; the product store is canonical for history (ALF-DEC-007). */
@Entity({ name: 'api_messages' })
@Check('chk_messages_role', `"role" IN ('user', 'assistant')`)
// (conversation_id, created_at, id) is created by the migration; declared for drift checks only.
@Index('idx_messages_conversation_order', { synchronize: false })
export class MessageEntity {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_messages' })
  id!: string;

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId!: string;

  @ManyToOne(() => ConversationEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id', foreignKeyConstraintName: 'fk_messages_conversation' })
  conversation!: ConversationEntity;

  @Column({ name: 'execution_id', type: 'uuid', nullable: true })
  executionId!: string | null;

  @ManyToOne(() => ExecutionEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'execution_id', foreignKeyConstraintName: 'fk_messages_execution' })
  execution!: ExecutionEntity | null;

  @Column({ type: 'varchar', length: 16 })
  role!: MessageRole;

  @Column({ type: 'text' })
  content!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
