import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from '../../../../users/user.entity';

@Entity({ name: 'refresh_sessions' })
@Index('idx_refresh_sessions_expiry', ['expiresAt'])
@Index('idx_refresh_sessions_family', ['familyId'])
@Index('idx_refresh_sessions_replacement', ['replacedBySessionId'])
@Index('idx_refresh_sessions_user', ['userId'])
@Index('uq_refresh_sessions_token_hash', ['tokenHash'], { unique: true })
export class RefreshSessionEntity {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_refresh_sessions' })
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, (user) => user.refreshSessions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_refresh_sessions_user' })
  user!: UserEntity;

  @Column({ name: 'family_id', type: 'uuid' })
  familyId!: string;

  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'rotated_at', type: 'timestamptz', nullable: true })
  rotatedAt!: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'replaced_by_session_id', type: 'uuid', nullable: true })
  replacedBySessionId!: string | null;

  @ManyToOne(() => RefreshSessionEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'replaced_by_session_id',
    foreignKeyConstraintName: 'fk_refresh_sessions_replacement',
  })
  replacedBySession!: RefreshSessionEntity | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
