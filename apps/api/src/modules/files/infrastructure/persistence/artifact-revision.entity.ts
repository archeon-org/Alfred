import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { ArtifactContentEntity } from './artifact-content.entity';
import { ArtifactEntity } from './artifact.entity';

/** ALF-DEC-025: an upload creates one immutable revision; an attachment pins the exact one. */
@Entity({ name: 'api_artifact_revisions' })
@Unique('uq_artifact_revisions_no', ['artifactId', 'revisionNo'])
@Check('chk_artifact_revisions_no', '"revision_no" > 0')
@Check('chk_artifact_revisions_origin', `"origin" IN ('upload')`)
@Index('idx_artifact_revisions_content', ['contentId'])
export class ArtifactRevisionEntity {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_artifact_revisions' })
  id!: string;

  @Column({ name: 'artifact_id', type: 'uuid' }) artifactId!: string;

  @ManyToOne(() => ArtifactEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'artifact_id', foreignKeyConstraintName: 'fk_artifact_revisions_artifact' })
  artifact!: ArtifactEntity;

  @Column({ name: 'revision_no', type: 'integer' }) revisionNo!: number;
  @Column({ name: 'content_id', type: 'uuid' }) contentId!: string;

  @ManyToOne(() => ArtifactContentEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'content_id', foreignKeyConstraintName: 'fk_artifact_revisions_content' })
  content!: ArtifactContentEntity;

  @Column({ type: 'varchar', length: 16 }) origin!: 'upload';
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
