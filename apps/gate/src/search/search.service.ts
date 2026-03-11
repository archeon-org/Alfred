import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { DocumentEntity } from '@archeon-org/database';
import { RagCitation, RagSearchMode, RagService } from './rag.service';

export interface SearchResult {
  document: DocumentEntity;
  similarity: number;
  matchReason?: string;
  bestSnippet?: string;
  citations: RagCitation[];
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @InjectRepository(DocumentEntity)
    private readonly documentRepository: Repository<DocumentEntity>,
    private readonly ragService: RagService,
  ) {}

  async hybridSearch(
    userId: string,
    query: string,
    limit: number = 10,
    mode: RagSearchMode = 'hybrid',
  ): Promise<SearchResult[]> {
    this.logger.log(`RAG search for user ${userId}: "${query}" mode=${mode}`);

    const ragResults = await this.ragService.searchDocuments(
      userId,
      query,
      limit,
      mode,
    );

    if (ragResults.length === 0) {
      this.logger.log('No results from RAG');
      return [];
    }

    const docIds = Array.from(new Set(ragResults.map((r) => r.document_id)));

    if (docIds.length === 0) {
      this.logger.log('No valid document IDs from RAG');
      return [];
    }

    const documents = await this.documentRepository.find({
      where: { id: In(docIds), userId },
    });

    const mapped: SearchResult[] = [];
    for (const result of ragResults) {
      const document = documents.find((doc) => doc.id === result.document_id);
      if (!document) {
        continue;
      }

      mapped.push({
        document,
        similarity: result.score,
        matchReason: 'chunk-match',
        bestSnippet: result.best_snippet,
        citations: result.citations || [],
      });
    }

    return mapped;
  }
}
