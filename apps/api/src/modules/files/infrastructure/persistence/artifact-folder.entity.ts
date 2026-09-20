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

/** A folder of the personal library. It is metadata only and never mirrors a storage path. */
@Entity({ name: 'api_artifact_folders' })
@Check('chk_artifact_folders_name', 'length(btrim("name")) > 0')
@Check('chk_artifact_folders_depth', '"depth" BETWEEN 1 AND 8')
@Check('chk_artifact_folders_parent', '"parent_id" IS NULL OR "parent_id" <> "id"')
// NULLS NOT DISTINCT, so that the top level is covered too; created by the migration.
@Index('uq_artifact_folders_sibling', { synchronize: false })
@Index('idx_artifact_folders_parent', ['parentId'])
export class ArtifactFolderEntity {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_artifact_folders' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' }) tenantId!: string;
  @Column({ name: 'owner_user_id', type: 'uuid' }) ownerUserId!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn([
    {
      name: 'tenant_id',
      referencedColumnName: 'tenantId',
      foreignKeyConstraintName: 'fk_artifact_folders_owner',
    },
    {
      name: 'owner_user_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'fk_artifact_folders_owner',
    },
  ])
  owner!: UserEntity;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true }) parentId!: string | null;

  @ManyToOne(() => ArtifactFolderEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'parent_id', foreignKeyConstraintName: 'fk_artifact_folders_parent' })
  parent!: ArtifactFolderEntity | null;

  @Column({ type: 'varchar', length: 120 }) name!: string;
  /** Case-folded name: what two siblings may not share. */
  @Column({ name: 'name_key', type: 'varchar', length: 120 }) nameKey!: string;
  @Column({ type: 'smallint' }) depth!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
