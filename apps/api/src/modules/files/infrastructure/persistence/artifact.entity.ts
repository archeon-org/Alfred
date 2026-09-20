import type { FileFailureCode, FileKind, FileReadiness } from '@alfred/contracts';
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

import { UserEntity } from '../../../users/user.entity';
import { ArtifactFolderEntity } from './artifact-folder.entity';
import { ArtifactRevisionEntity } from './artifact-revision.entity';

/**
 * A file of the owner's personal library (ALF-DEC-013 `/user`). The row is the catalog entry and
 * holds everything a list filters on; it outlives a deletion as a tombstone (`deletedAt`) so that
 * the messages which carried the file keep their meaning (ALF-DEC-028).
 */
@Entity({ name: 'api_artifacts' })
@Check('chk_artifacts_name', 'length(btrim("name")) > 0')
@Check('chk_artifacts_kind', `"kind" IN ('pdf', 'docx', 'image')`)
@Check('chk_artifacts_size', '"size_bytes" > 0')
@Check('chk_artifacts_readiness', `"readiness" IN ('processing', 'ready', 'failed')`)
@Check('chk_artifacts_tags', `jsonb_typeof("tags") = 'array' AND jsonb_array_length("tags") <= 16`)
@Index('idx_artifacts_owner_list', { synchronize: false })
@Index('uq_artifacts_sibling', { synchronize: false })
@Index('uq_artifacts_owner_sha256', { synchronize: false })
@Index('idx_artifacts_folder', { synchronize: false })
export class ArtifactEntity {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_artifacts' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' }) tenantId!: string;
  @Column({ name: 'owner_user_id', type: 'uuid' }) ownerUserId!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([
    {
      name: 'tenant_id',
      referencedColumnName: 'tenantId',
      foreignKeyConstraintName: 'fk_artifacts_owner',
    },
    {
      name: 'owner_user_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'fk_artifacts_owner',
    },
  ])
  owner!: UserEntity;

  @Column({ name: 'folder_id', type: 'uuid', nullable: true }) folderId!: string | null;

  @ManyToOne(() => ArtifactFolderEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'folder_id', foreignKeyConstraintName: 'fk_artifacts_folder' })
  folder!: ArtifactFolderEntity | null;

  @Column({ type: 'varchar', length: 255 }) name!: string;
  @Column({ name: 'name_key', type: 'varchar', length: 255 }) nameKey!: string;
  @Column({ type: 'varchar', length: 8 }) kind!: FileKind;
  @Column({ name: 'media_type', type: 'varchar', length: 127 }) mediaType!: string;
  @Column({ name: 'size_bytes', type: 'integer' }) sizeBytes!: number;
  @Column({ type: 'char', length: 64 }) sha256!: string;

  @Column({ name: 'current_revision_id', type: 'uuid', nullable: true })
  currentRevisionId!: string | null;

  @ManyToOne(() => ArtifactRevisionEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'current_revision_id',
    foreignKeyConstraintName: 'fk_artifacts_current_revision',
  })
  currentRevision!: ArtifactRevisionEntity | null;

  @Column({ type: 'varchar', length: 12 }) readiness!: FileReadiness;
  @Column({ name: 'failure_code', type: 'varchar', length: 32, nullable: true })
  failureCode!: FileFailureCode | null;

  @Column({ name: 'page_count', type: 'integer', nullable: true }) pageCount!: number | null;
  @Column({ type: 'varchar', length: 1024, nullable: true }) description!: string | null;
  @Column({ type: 'jsonb', default: [] }) tags!: string[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true }) deletedAt!: Date | null;
}
