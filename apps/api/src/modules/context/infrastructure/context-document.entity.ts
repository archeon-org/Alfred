import type { ContextDocumentKind } from '@alfred/contracts';
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
import { ProjectEntity } from '../../projects/infrastructure/persistence/project.entity';
import { UserEntity } from '../../users/user.entity';

@Entity({ name: 'api_context_documents' })
@Check(
  'chk_context_parent',
  '("user_id" IS NOT NULL AND "project_id" IS NULL) OR ("user_id" IS NULL AND "project_id" IS NOT NULL)',
)
@Check(
  'chk_context_kind',
  '("user_id" IS NOT NULL AND "kind" IN (\'instructions\', \'preferences\')) OR ("project_id" IS NOT NULL AND "kind" IN (\'context\', \'preferences\'))',
)
@Check('chk_context_size', 'octet_length("content") <= 65536')
@Check('chk_context_revision', '"revision" > 0')
@Index('uq_context_user_kind', ['userId', 'kind'], { unique: true, where: '"user_id" IS NOT NULL' })
@Index('uq_context_project_kind', ['projectId', 'kind'], {
  unique: true,
  where: '"project_id" IS NOT NULL',
})
export class ContextDocumentEntity {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_context_documents' })
  id!: string;
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;
  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId!: string | null;
  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_context_user' })
  user!: UserEntity | null;
  @ManyToOne(() => ProjectEntity, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'project_id', foreignKeyConstraintName: 'fk_context_project' })
  project!: ProjectEntity | null;
  @Column({ type: 'varchar', length: 16 })
  kind!: ContextDocumentKind;
  @Column({ type: 'text' })
  content!: string;
  @Column({ type: 'integer' })
  revision!: number;
  @Column({ name: 'content_hash', type: 'varchar', length: 64 })
  contentHash!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
