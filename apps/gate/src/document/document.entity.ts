import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  ManyToMany,
  JoinTable,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from '../user/user.entity';

import { Document } from '@archeon-org/types';
import { CategoryEntity } from '../category/category.entity';
import { TagEntity } from '../tag/tag.entity';

// Helps track where the file is in the pipeline
export enum ProcessingStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity('documents')
export class DocumentEntity implements Document {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  filename: string;

  @Column()
  originalName: string;

  @Column()
  mimetype: string;

  @Column('int')
  size: number;

  @Column()
  path: string; // R2 Key

  @Column({ nullable: true })
  thumbnailPath?: string;

  @Column({ nullable: true })
  title?: string; // AI can update this

  @Column({ nullable: true })
  description?: string; // AI Generated Summary

  @Column({ type: 'text', nullable: true, select: false })
  content?: string; // OCR Extracted Text

  // --- NEW: AI Metadata ---
  // Stores specific data like { "invoiceDate": "2023-01-01", "total": 500 }
  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @Column({ default: false })
  isProcessed: boolean;

  @Column({
    type: 'enum',
    enum: ProcessingStatus,
    default: ProcessingStatus.PENDING,
  })
  processingStatus: ProcessingStatus;

  @Column({
    type: 'enum',
    enum: ['AI', 'MANUAL'],
    default: 'AI',
  })
  classificationSource: 'AI' | 'MANUAL';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn() // Enables "Soft Delete" (Trash Bin)
  deletedAt?: Date;

  @Column()
  userId: string;

  // --- RELATIONSHIPS ---
  @ManyToOne(() => UserEntity, (user) => user.documents, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  // Folder Relation
  @Column({ nullable: true })
  categoryId: string;

  @ManyToOne(() => CategoryEntity, (cat) => cat.documents, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'categoryId' })
  category: CategoryEntity;

  // Tags Relation (Many-to-Many)
  @ManyToMany(() => TagEntity, (tag) => tag.documents, { cascade: true })
  @JoinTable({
    name: 'document_tags',
    joinColumn: { name: 'documentId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tagId', referencedColumnName: 'id' },
  })
  tags: TagEntity[];
}
