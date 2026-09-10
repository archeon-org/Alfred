import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { SkillEntity } from './skill.entity';
@Entity({ name: 'api_skill_versions' })
@Check('chk_skill_versions_number', '"version" > 0')
export class SkillVersionEntity {
  @PrimaryColumn({ name: 'skill_id', type: 'uuid', primaryKeyConstraintName: 'pk_skill_versions' })
  skillId!: string;
  @PrimaryColumn({ type: 'integer', primaryKeyConstraintName: 'pk_skill_versions' })
  version!: number;
  @ManyToOne(() => SkillEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'skill_id', foreignKeyConstraintName: 'fk_skill_versions_skill' })
  skill!: SkillEntity;
  @Column({ type: 'varchar', length: 64 }) name!: string;
  @Column({ type: 'varchar', length: 1024 }) description!: string;
  @Column({ name: 'content_hash', type: 'varchar', length: 64 }) contentHash!: string;
  @Column({ name: 'total_bytes', type: 'integer' }) totalBytes!: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true }) publishedAt!: Date | null;
}
