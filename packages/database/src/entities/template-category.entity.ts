import { TemplateCategory } from "@archeon-org/types";
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  UpdateDateColumn,
  CreateDateColumn,
} from "typeorm";
import { TemplateEntity } from "./template.entity";

@Entity("template_categories")
export class TemplateCategoryEntity implements TemplateCategory {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  name: string;

  @Column()
  icon: string;

  @Column()
  color: string;

  @Column({ type: "integer" })
  order: number;

  @Column({ type: "integer", default: 1 })
  level: number;

  @Column({ nullable: true })
  parentTemplateCategoryId?: string | null;

  @ManyToOne(() => TemplateEntity, (t) => t.categories, { onDelete: "CASCADE" })
  @JoinColumn({ name: "templateId" })
  template: TemplateEntity;

  @ManyToOne(() => TemplateCategoryEntity, (cat) => cat.childCategories, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "parentTemplateCategoryId" })
  parentCategory?: TemplateCategoryEntity | null;

  @OneToMany(() => TemplateCategoryEntity, (cat) => cat.parentCategory)
  childCategories?: TemplateCategoryEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
