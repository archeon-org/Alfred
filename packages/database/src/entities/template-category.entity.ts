import { TemplateCategory } from "@archeon-org/types";
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
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

  @ManyToOne(() => TemplateEntity, (t) => t.categories, { onDelete: "CASCADE" })
  @JoinColumn({ name: "templateId" })
  template: TemplateEntity;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
