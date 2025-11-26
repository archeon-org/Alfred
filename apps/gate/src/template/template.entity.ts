import { Template } from '@archeon-org/types';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  UpdateDateColumn,
  CreateDateColumn,
} from 'typeorm';
import { TemplateCategoryEntity } from './template-category.entity';
import { TemplateTagEntity } from './template-tag.entity';

@Entity('templates')
export class TemplateEntity implements Template {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string; // e.g. "Freelancer"

  @Column()
  description: string;

  @Column()
  icon: string;

  @Column({ type: 'integer' })
  order: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => TemplateCategoryEntity, (cat) => cat.template, {
    cascade: true,
  })
  categories: TemplateCategoryEntity[];

  @OneToMany(() => TemplateTagEntity, (tag) => tag.template, { cascade: true })
  tags: TemplateTagEntity[];
}
