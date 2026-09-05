import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { UserRole } from '../../common/auth/auth-principal';
import { RefreshSessionEntity } from '../auth/infrastructure/persistence/entities/refresh-session.entity';
import { UserIdentityEntity } from './user-identity.entity';

export type UserStatus = 'active' | 'disabled';

@Entity({ name: 'users' })
@Check('chk_users_role', `"role" IN ('user', 'admin')`)
@Check('chk_users_status', `"status" IN ('active', 'disabled')`)
@Index('uq_users_email', ['email'], { unique: true })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_users' })
  id!: string;

  @Column({ type: 'citext' })
  email!: string;

  @Column({ name: 'display_name', type: 'varchar', length: 160 })
  displayName!: string;

  @Column({ name: 'avatar_url', type: 'varchar', length: 2048, nullable: true })
  avatarUrl!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'user' })
  role!: UserRole;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: UserStatus;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => RefreshSessionEntity, (session) => session.user)
  refreshSessions!: RefreshSessionEntity[];

  @OneToMany(() => UserIdentityEntity, (identity) => identity.user)
  identities!: UserIdentityEntity[];
}
