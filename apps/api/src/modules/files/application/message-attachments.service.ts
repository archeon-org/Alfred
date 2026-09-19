import {
  FILE_MAX_ATTACHMENTS_PER_MESSAGE,
  FILE_MAX_IMAGES_PER_MESSAGE,
  type FileKind,
  type MessageAttachment,
} from '@alfred/contracts';
import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { DataSource, In, IsNull, type EntityManager } from 'typeorm';

import { ApiException } from '../../../common/errors/api.exception';
import type { OwnerScope } from '../../../common/ownership/owner-scope';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import {
  ATTACHMENT_PREAMBLE,
  buildPromptDocuments,
  type DocumentForPrompt,
} from '../domain/attachment-prompt';
import { ARTIFACT_CONTENT_STORE, type ArtifactContentStore } from '../domain/content-store.port';
import { ArtifactEntity } from '../infrastructure/persistence/artifact.entity';
import {
  MessageAttachmentEntity,
  type AttachmentDelivery,
} from '../infrastructure/persistence/message-attachment.entity';
import { FILE_SETTINGS, type FileSettings } from './file-settings';

/** LangChain multi-part human content, which the runtime's orchestrator already accepts. */
export type RuntimeContentPart =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'image_url'; readonly image_url: { readonly url: string } };

export type RuntimeUserContent = string | readonly RuntimeContentPart[];

interface AttachedRow {
  readonly message_id: string;
  readonly artifact_id: string;
  readonly name: string;
  readonly kind: FileKind;
  readonly media_type: string;
  readonly size_bytes: number;
  readonly delivery: AttachmentDelivery | null;
  readonly truncated: boolean;
  readonly available: boolean;
}

interface DeliverableRow {
  readonly artifact_id: string;
  readonly name: string;
  readonly kind: FileKind;
  readonly available: boolean;
  readonly text: string | null;
  readonly page_count: number | null;
  readonly extraction_truncated: boolean;
  readonly derivative_content_id: string | null;
  readonly derivative_media_type: string | null;
}

const NO_TEXT_NOTE = 'L’utilisateur a joint des fichiers sans écrire de message.';

/**
 * How long a dispatch may wait for the reduced images of one turn, all read at once. A store that
 * does not answer costs one undelivered image, never an execution worker held for minutes.
 */
const IMAGE_READ_BUDGET_MS = 15_000;

type Delivery = { delivery: AttachmentDelivery; chars: number | null; truncated: boolean };
const UNDELIVERED: Delivery = Object.freeze({
  delivery: 'unavailable',
  chars: null,
  truncated: false,
});

/**
 * Files as messages carry them (ALF-DEC-002 §7–8, ALF-DEC-010 "exact message attachments"). A
 * file is delivered once, with the turn that attached it: the runtime thread keeps its history,
 * so later turns never resend it.
 */
@Injectable()
export class MessageAttachmentsService {
  constructor(
    private readonly db: DataSource,
    @Inject(ARTIFACT_CONTENT_STORE) private readonly store: ArtifactContentStore,
    @Inject(FILE_SETTINGS) private readonly settings: FileSettings,
    @Optional() private readonly flags?: FeatureFlagsService,
  ) {}

  /**
   * The capability gate of every attachment path. The `/files` routes are hidden by the feature
   * guard, but a message reaches this service through the executions route, which another
   * capability guards: without this check a known file identifier would still be attached, and
   * its text delivered, with uploads switched off. A composition without the flag registry has no
   * upload capability (fail closed).
   */
  private get enabled(): boolean {
    return this.flags?.isEnabled('fileUploads') === true;
  }

  /** The same answer as a hidden route: the capability does not exist in this deployment. */
  assertAvailable(): void {
    if (!this.enabled) throw new NotFoundException('Feature is not available');
  }

  /** Inside the transaction that creates the user message: all files attach, or none does. */
  async bind(
    manager: EntityManager,
    scope: OwnerScope,
    messageId: string,
    attachmentIds: readonly string[],
  ): Promise<void> {
    const ids = [...new Set(attachmentIds)];
    if (ids.length === 0) return;
    this.assertAvailable();
    if (ids.length > FILE_MAX_ATTACHMENTS_PER_MESSAGE) {
      throw new ApiException(409, 'attachment_limit_reached', 'Too many files for one message.');
    }
    // Ownership is part of the query: a foreign or deleted file is simply not found. The rows are
    // locked FOR SHARE until this transaction commits, which serializes the attachment with a
    // deletion (FOR UPDATE on the same row): either the deletion wins and the file is not found
    // here, or the attachment wins and the deletion then sees an answer using the file.
    const artifacts = await manager.getRepository(ArtifactEntity).find({
      where: { id: In(ids), ...scope, deletedAt: IsNull() },
      lock: { mode: 'pessimistic_read' },
    });
    if (artifacts.length !== ids.length) {
      throw new ApiException(404, 'attachment_not_found', 'An attached file was not found.');
    }
    if (artifacts.some((artifact) => artifact.readiness !== 'ready')) {
      throw new ApiException(409, 'attachment_not_ready', 'An attached file is not ready yet.');
    }
    if (
      artifacts.filter((artifact) => artifact.kind === 'image').length > FILE_MAX_IMAGES_PER_MESSAGE
    ) {
      throw new ApiException(409, 'attachment_limit_reached', 'Too many images for one message.');
    }

    const byId = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
    const repository = manager.getRepository(MessageAttachmentEntity);
    await repository.save(
      ids.map((id, position) => {
        const artifact = byId.get(id) as ArtifactEntity;
        return repository.create({
          messageId,
          artifactId: artifact.id,
          revisionId: artifact.currentRevisionId as string,
          position,
          name: artifact.name,
          kind: artifact.kind,
          mediaType: artifact.mediaType,
          sizeBytes: artifact.sizeBytes,
          delivery: null,
          deliveredChars: null,
          truncated: false,
        });
      }),
    );
  }

  async forMessages(
    messageIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly MessageAttachment[]>> {
    if (messageIds.length === 0 || !this.enabled) return new Map();
    const rows: AttachedRow[] = await this.db.query(
      `SELECT a."message_id", a."artifact_id", a."name", a."kind", a."media_type", a."size_bytes",
              a."delivery", a."truncated", (f."deleted_at" IS NULL) AS available
       FROM "api_message_attachments" a JOIN "api_artifacts" f ON f."id" = a."artifact_id"
       WHERE a."message_id" = ANY($1::uuid[]) ORDER BY a."message_id", a."position"`,
      [messageIds],
    );
    const grouped = new Map<string, MessageAttachment[]>();
    for (const row of rows) {
      const list = grouped.get(row.message_id) ?? [];
      list.push({
        fileId: row.artifact_id,
        name: row.name,
        kind: row.kind,
        mediaType: row.media_type,
        sizeBytes: row.size_bytes,
        available: row.available,
        delivery: row.delivery,
        truncated: row.truncated,
      });
      grouped.set(row.message_id, list);
    }
    return grouped;
  }

  /** The files one user turn carried; the caller already holds the message identifier. */
  async forMessage(messageId: string): Promise<readonly MessageAttachment[]> {
    return (await this.forMessages([messageId])).get(messageId) ?? [];
  }

  /**
   * What the runtime receives for the user turn. Text is bounded by ALF-DEC-010 (per document and
   * per Execution) and framed as evidence; an image is the reduced, metadata-free copy made at
   * upload, never the original. Called at dispatch only, and records what was actually delivered.
   */
  async runtimeContent(
    executionId: string,
    userMessage: string,
    signal?: AbortSignal,
  ): Promise<RuntimeUserContent> {
    // A turn accepted before the capability was switched off delivers its text only.
    if (!this.enabled) return userMessage;
    const messageId = await this.userMessageId(executionId);
    if (messageId === null) return userMessage;
    const rows: DeliverableRow[] = await this.db.query(
      `SELECT a."artifact_id", a."name", a."kind", (f."deleted_at" IS NULL) AS available,
              e."text", e."page_count", e."truncated" AS extraction_truncated,
              d."id" AS derivative_content_id, d."media_type" AS derivative_media_type
       FROM "api_message_attachments" a
       JOIN "api_artifacts" f ON f."id" = a."artifact_id"
       JOIN "api_artifact_revisions" r ON r."id" = a."revision_id"
       LEFT JOIN "api_artifact_extractions" e ON e."content_id" = r."content_id" AND e."state" = 'ready'
       LEFT JOIN "api_artifact_contents" d ON d."id" = e."derivative_content_id" AND d."state" = 'ready'
       WHERE a."message_id" = $1 ORDER BY a."position"`,
      [messageId],
    );
    if (rows.length === 0) return userMessage;

    const deliveries = new Map<string, Delivery>();
    const documents: DocumentForPrompt[] = [];
    const pictures: DeliverableRow[] = [];

    for (const row of rows) {
      if (!row.available) deliveries.set(row.artifact_id, UNDELIVERED);
      else if (row.kind === 'image') pictures.push(row);
      else if (row.text === null) deliveries.set(row.artifact_id, UNDELIVERED);
      else {
        documents.push({
          artifactId: row.artifact_id,
          name: row.name,
          kind: row.kind,
          text: row.text,
          pageCount: row.page_count,
          extractionTruncated: row.extraction_truncated,
        });
      }
    }

    const images = await this.readImages(pictures, deliveries, signal);

    const prompted = buildPromptDocuments(documents, {
      tokensPerDocument: this.settings.promptTokensPerDocument,
      tokensPerExecution: this.settings.promptTokensPerExecution,
    });
    for (const document of prompted) {
      deliveries.set(document.artifactId, {
        delivery: 'text',
        chars: document.deliveredChars,
        truncated: document.truncated,
      });
    }
    await this.recordDeliveries(messageId, deliveries);

    const parts: RuntimeContentPart[] = [
      { type: 'text', text: userMessage.length > 0 ? userMessage : NO_TEXT_NOTE },
    ];
    if (prompted.length > 0) {
      parts.push({
        type: 'text',
        text: [ATTACHMENT_PREAMBLE, ...prompted.map((document) => document.block)].join('\n\n'),
      });
    }
    return [...parts, ...images];
  }

  /**
   * Reads the reduced copies of one turn together, under one budget and the dispatch's own
   * signal. A cancelled execution stops at once; a store that fails or is too slow costs the
   * image, recorded as undelivered, rather than the execution.
   */
  private async readImages(
    pictures: readonly DeliverableRow[],
    deliveries: Map<string, Delivery>,
    signal?: AbortSignal,
  ): Promise<RuntimeContentPart[]> {
    if (pictures.length === 0) return [];
    const budget = new AbortController();
    const deadline = setTimeout(() => {
      budget.abort();
    }, IMAGE_READ_BUDGET_MS);
    deadline.unref();
    const bounded = signal === undefined ? budget.signal : AbortSignal.any([signal, budget.signal]);

    const read = await Promise.all(
      pictures.map(async (row): Promise<RuntimeContentPart | null> => {
        if (row.derivative_content_id === null || row.derivative_media_type === null) return null;
        try {
          const bytes = await this.store.get(row.derivative_content_id, { signal: bounded });
          if (bytes === null) return null;
          return {
            type: 'image_url',
            image_url: {
              url: `data:${row.derivative_media_type};base64,${bytes.toString('base64')}`,
            },
          };
        } catch (error) {
          // The execution itself was cancelled: that is not an image problem.
          if (signal?.aborted === true) throw error;
          return null;
        }
      }),
    ).finally(() => {
      clearTimeout(deadline);
    });

    const images: RuntimeContentPart[] = [];
    pictures.forEach((row, index) => {
      const image = read[index] ?? null;
      if (image !== null) images.push(image);
      deliveries.set(
        row.artifact_id,
        image === null ? UNDELIVERED : { delivery: 'image', chars: null, truncated: false },
      );
    });
    return images;
  }

  private async recordDeliveries(
    messageId: string,
    deliveries: ReadonlyMap<string, Delivery>,
  ): Promise<void> {
    for (const [artifactId, outcome] of deliveries) {
      await this.db.getRepository(MessageAttachmentEntity).update(
        { messageId, artifactId },
        {
          delivery: outcome.delivery,
          deliveredChars: outcome.chars,
          truncated: outcome.truncated,
        },
      );
    }
  }

  private async userMessageId(executionId: string): Promise<string | null> {
    const rows: { id: string }[] = await this.db.query(
      `SELECT "id" FROM "api_messages" WHERE "execution_id" = $1 AND "role" = 'user' LIMIT 1`,
      [executionId],
    );
    return rows[0]?.id ?? null;
  }
}
