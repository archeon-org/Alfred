import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { UserEntity } from "./user.entity";
import { DocumentEntity } from "./document.entity";

/**
 * DocumentEmbeddingEntity stores vector embeddings for document content.
 * Each document can have one embedding that represents its semantic content.
 * Embeddings are partitioned by userId for efficient per-user similarity searches.
 */
@Entity("document_embeddings")
@Index("idx_document_embeddings_user", ["userId"])
@Index("idx_document_embeddings_document", ["documentId"], { unique: true })
export class DocumentEmbeddingEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  documentId: string;

  @Column()
  userId: string;

  /**
   * The vector embedding stored as a float array.
   * Using 1024 dimensions for nomic-embed-text-v1.5 model.
   * PostgreSQL pgvector will store this as a vector type.
   */
  @Column("float", { array: true })
  embedding: number[];

  /**
   * The model used to generate this embedding.
   * Useful for future migrations if we change embedding models.
   */
  @Column({ default: "nomic-ai/nomic-embed-text-v1.5" })
  model: string;

  /**
   * Number of dimensions in the embedding vector.
   */
  @Column({ default: 768 })
  dimensions: number;

  /**
   * Hash of the content used to generate this embedding.
   * Used to detect if content has changed and re-embedding is needed.
   */
  @Column({ nullable: true })
  contentHash?: string;

  @CreateDateColumn()
  createdAt: Date;

  // --- RELATIONSHIPS ---
  @ManyToOne(() => DocumentEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "documentId" })
  document: DocumentEntity;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: UserEntity;
}
