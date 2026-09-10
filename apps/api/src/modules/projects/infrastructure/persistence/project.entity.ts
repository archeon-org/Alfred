import type { ProjectKind, ProjectStatus } from '@alfred/contracts';
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
import { TenantEntity } from '../../../tenants/tenant.entity';
import { UserEntity } from '../../../users/user.entity';

@Entity({ name: 'api_projects' })
@Check('chk_projects_kind', `"kind" IN ('implicit', 'named')`)
@Check('chk_projects_name', `"kind" = 'implicit' OR "name" IS NOT NULL`)
@Check('chk_projects_context_size', `"context" IS NULL OR octet_length("context") <= 65536`)
@Check('chk_projects_status', `"status" IN ('active', 'archived', 'deleting')`)
// (tenant_id, owner_user_id, kind, status, updated_at DESC, id DESC) is created by the migration;
// TypeORM decorators cannot express column order, so the index is only declared for drift checks.
@Index('idx_projects_owner_list', { synchronize: false })
// Partial index (WHERE pinned_at IS NOT NULL) created by the migration for pinned lists.
@Index('idx_projects_pinned', { synchronize: false })
export class ProjectEntity {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_projects' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'owner_user_id', type: 'uuid' })
  ownerUserId!: string;

  @ManyToOne(() => TenantEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tenant_id', foreignKeyConstraintName: 'fk_projects_tenant' })
  tenant!: TenantEntity;

  // Composite key keeps the owner inside the project's tenant (ALF-DEC-055 §7).
  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn([
    {
      name: 'tenant_id',
      referencedColumnName: 'tenantId',
      foreignKeyConstraintName: 'fk_projects_owner',
    },
    {
      name: 'owner_user_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'fk_projects_owner',
    },
  ])
  owner!: UserEntity;

  @Column({ type: 'varchar', length: 8 })
  kind!: ProjectKind;

  @Column({ type: 'varchar', length: 160, nullable: true })
  name!: string | null;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  description!: string | null;

  @Column({ type: 'text', nullable: true })
  context!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: ProjectStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt!: Date | null;

  @Column({ name: 'pinned_at', type: 'timestamptz', nullable: true })
  pinnedAt!: Date | null;
}
