import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { UserEntity } from '../../users/user.entity';
import { WorkspaceEntity } from './workspace.entity';

/** Both composite foreign keys enforce the same organization without cross-table CHECKs. */
@Entity({ name: 'api_workspace_memberships' })
@Index('idx_workspace_memberships_workspace', ['tenantId', 'workspaceId'])
export class WorkspaceMembershipEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @PrimaryColumn({
    name: 'user_id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_workspace_memberships',
  })
  userId!: string;

  @PrimaryColumn({
    name: 'workspace_id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_workspace_memberships',
  })
  workspaceId!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn([
    {
      name: 'tenant_id',
      referencedColumnName: 'tenantId',
      foreignKeyConstraintName: 'fk_workspace_memberships_user',
    },
    {
      name: 'user_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'fk_workspace_memberships_user',
    },
  ])
  user!: UserEntity;

  @ManyToOne(() => WorkspaceEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([
    {
      name: 'tenant_id',
      referencedColumnName: 'tenantId',
      foreignKeyConstraintName: 'fk_workspace_memberships_workspace',
    },
    {
      name: 'workspace_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'fk_workspace_memberships_workspace',
    },
  ])
  workspace!: WorkspaceEntity;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
