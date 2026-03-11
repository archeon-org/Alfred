import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { DocumentEntity } from "./document.entity";
import { UserEntity } from "./user.entity";

@Entity("document_chunks")
@Index("idx_document_chunks_user", ["userId"])
@Index("idx_document_chunks_document", ["documentId"])
@Index("idx_document_chunks_unique_doc_idx", ["documentId", "chunkIndex"], {
  unique: true,
})
export class DocumentChunkEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  documentId: string;

  @Column()
  userId: string;

  @Column({ type: "int" })
  chunkIndex: number;

  @Column({ type: "text" })
  content: string;

  @Column()
  contentHash: string;

  @Column({ type: "int" })
  tokenCount: number;

  @Column({ type: "int" })
  startOffset: number;

  @Column({ type: "int" })
  endOffset: number;

  @Column("vector", { length: 1536 })
  embedding: number[];

  @Column({ default: "fireworks/qwen3-embedding-8b" })
  model: string;

  @Column({ type: "jsonb", nullable: true })
  metadata?: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => DocumentEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "documentId" })
  document: DocumentEntity;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: UserEntity;
}
