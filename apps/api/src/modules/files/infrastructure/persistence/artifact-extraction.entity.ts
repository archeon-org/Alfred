import type { FileFailureCode, FileKind } from '@alfred/contracts';
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import { ArtifactContentEntity } from './artifact-content.entity';

export type ArtifactExtractionState = 'queued' | 'running' | 'ready' | 'failed';

/**
 * What the agent can use from a stored original, and the job that produces it: extracted text
 * for a document, a reduced model-facing copy for an image. Separate from the catalog row so that
 * a list never loads the text, and claimed with a lease like executions are (ALF-DEC-010).
 */
@Entity({ name: 'api_artifact_extractions' })
@Check('chk_artifact_extractions_kind', `"kind" IN ('pdf', 'docx', 'image')`)
@Check('chk_artifact_extractions_state', `"state" IN ('queued', 'running', 'ready', 'failed')`)
@Check('chk_artifact_extractions_text', '"text" IS NULL OR octet_length("text") <= 4194304')
@Index('idx_artifact_extractions_queue', { synchronize: false })
export class ArtifactExtractionEntity {
  @PrimaryColumn({
    name: 'content_id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_artifact_extractions',
  })
  contentId!: string;

  @OneToOne(() => ArtifactContentEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'content_id', foreignKeyConstraintName: 'fk_artifact_extractions_content' })
  content!: ArtifactContentEntity;

  @Column({ type: 'varchar', length: 8 }) kind!: FileKind;
  @Column({ type: 'varchar', length: 12, default: 'queued' }) state!: ArtifactExtractionState;
  @Column({ type: 'text', nullable: true }) text!: string | null;
  @Column({ name: 'char_count', type: 'integer', default: 0 }) charCount!: number;
  @Column({ name: 'page_count', type: 'integer', nullable: true }) pageCount!: number | null;
  @Column({ type: 'boolean', default: false }) truncated!: boolean;

  @Column({ name: 'derivative_content_id', type: 'uuid', nullable: true })
  derivativeContentId!: string | null;

  @ManyToOne(() => ArtifactContentEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'derivative_content_id',
    foreignKeyConstraintName: 'fk_artifact_extractions_derivative',
  })
  derivativeContent!: ArtifactContentEntity | null;

  @Column({ name: 'failure_code', type: 'varchar', length: 32, nullable: true })
  failureCode!: FileFailureCode | null;

  @Column({ type: 'smallint', default: 0 }) attempts!: number;
  @Column({ name: 'next_attempt_at', type: 'timestamptz', default: () => 'now()' })
  nextAttemptAt!: Date;

  @Column({ name: 'lease_owner', type: 'varchar', length: 128, nullable: true })
  leaseOwner!: string | null;

  @Column({ name: 'lease_expires_at', type: 'timestamptz', nullable: true })
  leaseExpiresAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
