import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CategoryEntity, DocumentEntity } from '@archeon-org/database';
import { RagUserContext } from '../common/rag-user-context';
import {
  RagAgentMode,
  RagAnswerResponse,
  RagCitation,
  RagService,
} from './rag.service';

export interface DocumentSuggestion {
  id: string;
  title: string | null;
  originalName: string;
  categoryName: string | null;
  categoryColor: string | null;
  thumbnailPath: string | null;
  similarity: number;
  createdAt: Date;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  documents?: DocumentSuggestion[];
  citations?: RagCitation[];
  timestamp?: string;
}

export interface ChatContext {
  excludedDocumentIds: string[];
  refinements: string[];
  lastQuery: string;
  failedAttempts: number;
  searchAttempts: number;
}

@Injectable()
export class ChatSearchService {
  private readonly logger = new Logger(ChatSearchService.name);

  constructor(
    private readonly ragService: RagService,
    @InjectRepository(DocumentEntity)
    private readonly documentRepository: Repository<DocumentEntity>,
    @InjectRepository(CategoryEntity)
    private readonly categoryRepository: Repository<CategoryEntity>,
  ) {}

  async chat(
    userId: string,
    userMessage: string,
    conversationHistory: ChatMessage[],
    context: ChatContext,
    agentMode: RagAgentMode = 'normal',
    userContext?: RagUserContext,
  ): Promise<{
    response: ChatMessage;
    updatedContext: ChatContext;
  }> {
    this.logger.log(`RAG chat for user ${userId}: "${userMessage}"`);

    const ragResult = await this.ragService.chat(
      userId,
      userMessage,
      conversationHistory.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      15,
      agentMode,
      userContext,
    );

    if (!ragResult) {
      throw new Error('Chat search failed');
    }

    return this.hydrateChatResponse(userId, userMessage, context, ragResult);
  }

  async hydrateChatResponse(
    userId: string,
    userMessage: string,
    context: ChatContext,
    ragResult: Pick<RagAnswerResponse, 'answer' | 'citations'>,
  ): Promise<{
    response: ChatMessage;
    updatedContext: ChatContext;
  }> {
    const documents = await this.buildDocumentSuggestions(
      userId,
      ragResult.citations,
      context.excludedDocumentIds,
    );

    const responseMessage: ChatMessage = {
      role: 'assistant',
      content: ragResult.answer,
      documents: documents.length > 0 ? documents : undefined,
      citations: ragResult.citations || [],
      timestamp: new Date().toISOString(),
    };

    const updatedContext: ChatContext = {
      ...context,
      lastQuery: userMessage,
      refinements: [...context.refinements, userMessage].slice(-20),
      searchAttempts: context.searchAttempts + 1,
    };

    return { response: responseMessage, updatedContext };
  }

  excludeDocument(context: ChatContext, documentId: string): ChatContext {
    return {
      ...context,
      excludedDocumentIds: Array.from(
        new Set([...context.excludedDocumentIds, documentId]),
      ),
      failedAttempts: context.failedAttempts + 1,
    };
  }

  createContext(): ChatContext {
    return {
      excludedDocumentIds: [],
      refinements: [],
      lastQuery: '',
      failedAttempts: 0,
      searchAttempts: 0,
    };
  }

  private async buildDocumentSuggestions(
    userId: string,
    citations: RagCitation[],
    excludedDocumentIds: string[],
  ): Promise<DocumentSuggestion[]> {
    if (!citations.length) {
      return [];
    }

    const scoreByDocument = new Map<string, number>();
    for (const citation of citations) {
      if (excludedDocumentIds.includes(citation.documentId)) {
        continue;
      }
      const existing = scoreByDocument.get(citation.documentId) || 0;
      scoreByDocument.set(
        citation.documentId,
        Math.max(existing, citation.score),
      );
    }

    const documentIds = Array.from(scoreByDocument.keys()).slice(0, 6);
    if (!documentIds.length) {
      return [];
    }

    const documents = await this.documentRepository.find({
      where: documentIds.map((id) => ({ id, userId })),
      order: { createdAt: 'DESC' },
    });

    const categoryIds = Array.from(
      new Set(documents.map((doc) => doc.categoryId).filter(Boolean)),
    ) as string[];
    const categories =
      categoryIds.length > 0
        ? await this.categoryRepository.findByIds(categoryIds)
        : [];
    const categoryById = new Map(categories.map((cat) => [cat.id, cat]));

    return documents
      .map((document) => {
        const category = document.categoryId
          ? categoryById.get(document.categoryId)
          : null;
        return {
          id: document.id,
          title: document.title || null,
          originalName: document.originalName,
          categoryName: category?.name || null,
          categoryColor: category?.color || null,
          thumbnailPath: document.thumbnailPath || null,
          similarity: scoreByDocument.get(document.id) || 0,
          createdAt: document.createdAt,
        } satisfies DocumentSuggestion;
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3);
  }
}
