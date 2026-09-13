import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  Unique,
} from 'typeorm';
import { ConversationEntity } from '../../../conversations/infrastructure/persistence/conversation.entity';

/**
 * The single active runtime thread bound to a conversation (ALF-DEC-032). A thread identifier is
 * private, never a product identity, and cannot back two conversations at once.
 */
@Entity({ name: 'api_runtime_threads' })
@Unique('uq_runtime_threads_thread', ['runtime', 'threadId'])
export class RuntimeThreadEntity {
  @PrimaryColumn({
    name: 'conversation_id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_runtime_threads',
  })
  conversationId!: string;

  @OneToOne(() => ConversationEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'conversation_id',
    foreignKeyConstraintName: 'fk_runtime_threads_conversation',
  })
  conversation!: ConversationEntity;

  @Column({ type: 'varchar', length: 32, default: 'langgraph' })
  runtime!: string;

  @Column({ name: 'thread_id', type: 'varchar', length: 128 })
  threadId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
