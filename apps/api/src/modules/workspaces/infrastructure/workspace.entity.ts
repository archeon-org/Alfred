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
  UpdateDateColumn,
} from 'typeorm';
import { TenantEntity } from '../../tenants/tenant.entity';

@Entity({ name: 'api_workspaces' })
@Check('chk_workspaces_slug', `"slug" ~ '^[a-z0-9][a-z0-9-]{0,63}$'`)
@Check('chk_workspaces_name', `length(btrim("name")) > 0`)
@Check('chk_workspaces_status', `"status" IN ('active', 'archived')`)
@Index('uq_workspaces_tenant_slug', ['tenantId', 'slug'], { unique: true })
@Unique('uq_workspaces_tenant_id', ['tenantId', 'id'])
export class WorkspaceEntity {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_workspaces' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => TenantEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tenant_id', foreignKeyConstraintName: 'fk_workspaces_tenant' })
  tenant!: TenantEntity;

  @Column({ type: 'varchar', length: 64 })
  slug!: string;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: 'active' | 'archived';

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
