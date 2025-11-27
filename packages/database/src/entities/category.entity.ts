import { Category } from "@archeon-org/types";
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  JoinColumn,
  UpdateDateColumn,
} from "typeorm";
import { UserEntity } from "./user.entity";
import { DocumentEntity } from "./document.entity";

@Entity("categories")
export class CategoryEntity implements Category {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  name: string; // e.g., "Finance", "Medical"

  @Column({ default: "folder-outline" })
  icon: string; // Ionicons name

  @Column({ default: "#4F46E5" })
  color: string; // Hex Code

  @Column({ default: true })
  isSystemDefault: boolean; // TRUE = Template/AI Created, FALSE = User Created

  // --- Relationships ---
  @Column({ nullable: true })
  userId: string;

  @ManyToOne(() => UserEntity, (user) => user.categories, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "userId" })
  user: UserEntity;

  @OneToMany(() => DocumentEntity, (doc) => doc.category)
  documents: DocumentEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
