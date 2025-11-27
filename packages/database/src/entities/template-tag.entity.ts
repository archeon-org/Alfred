import { TemplateTag } from "@archeon-org/types";
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { TemplateEntity } from "./template.entity";

@Entity("template_tags")
export class TemplateTagEntity implements TemplateTag {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  name: string;

  @Column()
  color: string;

  @Column({ type: "integer" })
  order: number;

  @ManyToOne(() => TemplateEntity, (t) => t.tags, { onDelete: "CASCADE" })
  @JoinColumn({ name: "templateId" })
  template: TemplateEntity;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
