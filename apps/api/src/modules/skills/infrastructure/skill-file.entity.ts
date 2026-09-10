import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { SkillVersionEntity } from './skill-version.entity';
@Entity({ name: 'api_skill_files' })
@Check(
  'chk_skill_files_size',
  '"size_bytes" = octet_length("content") AND "size_bytes" BETWEEN 0 AND 1048576',
)
export class SkillFileEntity {
  @PrimaryColumn({ name: 'skill_id', type: 'uuid', primaryKeyConstraintName: 'pk_skill_files' })
  skillId!: string;
  @PrimaryColumn({ type: 'integer', primaryKeyConstraintName: 'pk_skill_files' }) version!: number;
  @PrimaryColumn({ type: 'varchar', length: 240, primaryKeyConstraintName: 'pk_skill_files' })
  path!: string;
  @ManyToOne(() => SkillVersionEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn([
    {
      name: 'skill_id',
      referencedColumnName: 'skillId',
      foreignKeyConstraintName: 'fk_skill_files_version',
    },
    {
      name: 'version',
      referencedColumnName: 'version',
      foreignKeyConstraintName: 'fk_skill_files_version',
    },
  ])
  skillVersion!: SkillVersionEntity;
  @Column({ type: 'bytea' }) content!: Buffer;
  @Column({ name: 'media_type', type: 'varchar', length: 127 }) mediaType!: string;
  @Column({ name: 'size_bytes', type: 'integer' }) sizeBytes!: number;
}
