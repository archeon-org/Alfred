import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type TenantStatus = 'active' | 'suspended';

/** Minimal product isolation root (ALF-DEC-055). No administration surface exists in V1. */
@Entity({ name: 'api_tenants' })
@Check('chk_tenants_slug', `"slug" ~ '^[a-z0-9][a-z0-9-]{0,63}$'`)
@Check('chk_tenants_status', `"status" IN ('active', 'suspended')`)
@Index('uq_tenants_slug', ['slug'], { unique: true })
export class TenantEntity {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_tenants' })
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  slug!: string;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: TenantStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
