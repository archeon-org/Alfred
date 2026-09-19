import type { FileKind } from '@alfred/contracts';
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';

import { MessageEntity } from '../../../executions/infrastructure/persistence/message.entity';
import { ArtifactRevisionEntity } from './artifact-revision.entity';
import { ArtifactEntity } from './artifact.entity';

export type AttachmentDelivery = 'text' | 'image' | 'unavailable';

/**
 * A file as one message carried it (ALF-DEC-002: an attachment pins the exact revision). The row
 * keeps the name it was sent under, so the transcript still says what was attached after the file
 * is renamed or deleted, and it records what the model actually received.
 */
@Entity({ name: 'api_message_attachments' })
@Check('chk_message_attachments_position', '"position" BETWEEN 0 AND 15')
@Check('chk_message_attachments_kind', `"kind" IN ('pdf', 'docx', 'image')`)
@Check(
  'chk_message_attachments_delivery',
  `"delivery" IS NULL OR "delivery" IN ('text', 'image', 'unavailable')`,
)
@Index('idx_message_attachments_artifact', ['artifactId'])
export class MessageAttachmentEntity {
  @PrimaryColumn({
    name: 'message_id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_message_attachments',
  })
  messageId!: string;

  @ManyToOne(() => MessageEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'message_id', foreignKeyConstraintName: 'fk_message_attachments_message' })
  message!: MessageEntity;

  @PrimaryColumn({
    name: 'artifact_id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_message_attachments',
  })
  artifactId!: string;

  @ManyToOne(() => ArtifactEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'artifact_id', foreignKeyConstraintName: 'fk_message_attachments_artifact' })
  artifact!: ArtifactEntity;

  @Column({ name: 'revision_id', type: 'uuid' }) revisionId!: string;

  @ManyToOne(() => ArtifactRevisionEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'revision_id', foreignKeyConstraintName: 'fk_message_attachments_revision' })
  revision!: ArtifactRevisionEntity;

  @Column({ type: 'smallint' }) position!: number;
  @Column({ type: 'varchar', length: 255 }) name!: string;
  @Column({ type: 'varchar', length: 8 }) kind!: FileKind;
  @Column({ name: 'media_type', type: 'varchar', length: 127 }) mediaType!: string;
  @Column({ name: 'size_bytes', type: 'integer' }) sizeBytes!: number;
  @Column({ type: 'varchar', length: 12, nullable: true }) delivery!: AttachmentDelivery | null;
  @Column({ name: 'delivered_chars', type: 'integer', nullable: true })
  deliveredChars!: number | null;

  @Column({ type: 'boolean', default: false }) truncated!: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
