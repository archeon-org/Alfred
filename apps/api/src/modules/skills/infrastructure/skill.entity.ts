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
import { UserEntity } from '../../users/user.entity';
@Entity({ name: 'api_skills' })
@Check(
  'chk_skills_versions',
  '"version" > 0 AND "current_version" > 0 AND "current_version" <= "version" AND ("published_version" IS NULL OR ("published_version" > 0 AND "published_version" <= "version"))',
)
@Check('chk_skills_sizes', '"file_count" BETWEEN 1 AND 50 AND "total_bytes" BETWEEN 1 AND 1048576')
@Index('uq_skills_owner_name', ['tenantId', 'ownerUserId', 'name'], { unique: true })
@Index('idx_skills_owner_list', { synchronize: false })
export class SkillEntity {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_skills' }) id!: string;
  @Column({ name: 'tenant_id', type: 'uuid' }) tenantId!: string;
  @Column({ name: 'owner_user_id', type: 'uuid' }) ownerUserId!: string;
  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn([
    {
      name: 'tenant_id',
      referencedColumnName: 'tenantId',
      foreignKeyConstraintName: 'fk_skills_owner',
    },
    {
      name: 'owner_user_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'fk_skills_owner',
    },
  ])
  owner!: UserEntity;
  @Column({ type: 'varchar', length: 64 }) name!: string;
  @Column({ type: 'varchar', length: 1024 }) description!: string;
  @Column({ type: 'boolean', default: true }) enabled!: boolean;
  @Column({ type: 'integer' }) version!: number;
  @Column({ name: 'current_version', type: 'integer' })
  currentVersion!: number;

  @Column({ name: 'published_version', type: 'integer', nullable: true }) publishedVersion!:
    number | null;
  @Column({ name: 'file_count', type: 'integer' }) fileCount!: number;
  @Column({ name: 'total_bytes', type: 'integer' }) totalBytes!: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
