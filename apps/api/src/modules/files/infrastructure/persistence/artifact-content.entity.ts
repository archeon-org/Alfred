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

export type ArtifactContentState = 'pending' | 'ready' | 'failed' | 'purging' | 'purged';
export type ArtifactContentRole = 'original' | 'derivative';

/**
 * One stored object. `id` is the opaque content identity of the content store (ALF-DEC-054); a
 * `pending` row is also the quota reservation of an upload in flight (Revision 86).
 */
@Entity({ name: 'api_artifact_contents' })
@Check('chk_artifact_contents_role', `"role" IN ('original', 'derivative')`)
@Check('chk_artifact_contents_backend', `"backend" IN ('local', 's3')`)
@Check('chk_artifact_contents_size', '"size_bytes" > 0')
@Check('chk_artifact_contents_sha256', `"sha256" ~ '^[0-9a-f]{64}$'`)
@Check(
  'chk_artifact_contents_state',
  `"state" IN ('pending', 'ready', 'failed', 'purging', 'purged')`,
)
@Index('uq_artifact_contents_upload', { synchronize: false })
@Index('idx_artifact_contents_quota', { synchronize: false })
@Index('idx_artifact_contents_collect', { synchronize: false })
export class ArtifactContentEntity {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_artifact_contents' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' }) tenantId!: string;
  @Column({ name: 'owner_user_id', type: 'uuid' }) ownerUserId!: string;

  // RESTRICT: bytes live outside PostgreSQL, so a row cascade would orphan stored objects.
  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([
    {
      name: 'tenant_id',
      referencedColumnName: 'tenantId',
      foreignKeyConstraintName: 'fk_artifact_contents_owner',
    },
    {
      name: 'owner_user_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'fk_artifact_contents_owner',
    },
  ])
  owner!: UserEntity;

  @Column({ type: 'varchar', length: 12 }) role!: ArtifactContentRole;
  @Column({ type: 'varchar', length: 8 }) backend!: 'local' | 's3';
  @Column({ name: 'media_type', type: 'varchar', length: 127 }) mediaType!: string;
  @Column({ name: 'size_bytes', type: 'integer' }) sizeBytes!: number;
  @Column({ type: 'char', length: 64 }) sha256!: string;
  @Column({ type: 'varchar', length: 12 }) state!: ArtifactContentState;
  @Column({ name: 'upload_id', type: 'uuid', nullable: true }) uploadId!: string | null;
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true }) expiresAt!: Date | null;
  @Column({ name: 'purged_at', type: 'timestamptz', nullable: true }) purgedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
