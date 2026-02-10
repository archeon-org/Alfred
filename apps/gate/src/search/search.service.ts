import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { DocumentEntity } from '@archeon-org/database';
import { GraphitiSearchService } from './graphiti-search.service';

export interface SearchResult {
  document: DocumentEntity;
  similarity: number;
  matchReason?: string;
  matchDetails?: {
    semantic?: number;
  };
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @InjectRepository(DocumentEntity)
    private readonly documentRepository: Repository<DocumentEntity>,
    private readonly graphitiSearchService: GraphitiSearchService,
  ) {}

  async hybridSearch(
    userId: string,
    query: string,
    limit: number = 10,
  ): Promise<SearchResult[]> {
    this.logger.log(`Hybrid search for user ${userId}: "${query}"`);

    const graphitiResults = await this.graphitiSearchService.searchDocuments(
      userId,
      query,
      limit,
    );

    if (graphitiResults.length === 0) {
      this.logger.log('No results from Graphiti');
      return [];
    }

    const graphitiDocIds = graphitiResults
      .map((r) => r.document_id)
      .filter((id): id is string => !!id);

    if (graphitiDocIds.length === 0) {
      this.logger.log('No valid document IDs from Graphiti');
      return [];
    }

    const documents = await this.documentRepository.find({
      where: { id: In(graphitiDocIds) },
    });

    const results: SearchResult[] = [];

    for (const gResult of graphitiResults) {
      if (!gResult.document_id) continue;

      const doc = documents.find((d) => d.id === gResult.document_id);
      if (!doc) continue;

      results.push({
        document: doc,
        similarity: gResult.relevance,
        matchReason:
          gResult.matched_entities.length > 0
            ? `Found via: ${gResult.matched_entities.join(', ')}`
            : 'Found via semantic search',
        matchDetails: {
          semantic: gResult.relevance,
        },
      });
    }

    return results;
  }
}
