import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';

@Entity({ name: 'user_identities' })
@Index('idx_user_identities_user', ['userId'])
@Index('uq_user_identities_issuer_subject', ['issuer', 'subject'], { unique: true })
export class UserIdentityEntity {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_user_identities' })
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, (user) => user.identities, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_user_identities_user' })
  user!: UserEntity;

  @Column({ type: 'varchar', length: 32 })
  provider!: string;

  @Column({ type: 'varchar', length: 512 })
  issuer!: string;

  @Column({ type: 'varchar', length: 255 })
  subject!: string;

  @Column({ name: 'email_at_link', type: 'citext' })
  emailAtLink!: string;

  @Column({ name: 'last_authenticated_at', type: 'timestamptz' })
  lastAuthenticatedAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
