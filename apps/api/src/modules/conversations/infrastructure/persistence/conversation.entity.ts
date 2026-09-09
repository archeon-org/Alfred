import type { ConversationTitleSource } from '@alfred/contracts';
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
import { ProjectEntity } from '../../../projects/infrastructure/persistence/project.entity';

@Entity({ name: 'api_conversations' })
@Check('chk_conversations_title_source', `"title_source" IN ('none', 'auto', 'user')`)
// (project_id, created_at DESC, id DESC) is created by the migration; TypeORM decorators cannot
// express column order, so the index is only declared for drift checks.
@Index('idx_conversations_project_list', { synchronize: false })
@Index('idx_conversations_pinned_list', { synchronize: false })
export class ConversationEntity {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_conversations' })
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  // Authorization is inherited from the parent project (ALF-DEC-004 §2).
  @ManyToOne(() => ProjectEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id', foreignKeyConstraintName: 'fk_conversations_project' })
  project!: ProjectEntity;

  @Column({ type: 'varchar', length: 160, default: 'Nouvelle conversation' })
  title!: string;

  @Column({ name: 'title_source', type: 'varchar', length: 8, default: 'none' })
  titleSource!: ConversationTitleSource;

  @Column({ name: 'pinned_at', type: 'timestamptz', nullable: true })
  pinnedAt!: Date | null;

  @Column({ name: 'last_activity_at', type: 'timestamptz', nullable: true })
  lastActivityAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt!: Date | null;
}
