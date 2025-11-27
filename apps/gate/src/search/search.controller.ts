import {
  Controller,
  Get,
  Query,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { UserEntity } from '@archeon-org/database';
import { SearchService, SearchResult } from './search.service';

interface SearchQueryDto {
  q: string;
  limit?: string;
  mode?: 'semantic' | 'hybrid';
}

interface SearchResponseItem {
  id: string;
  filename: string;
  originalName: string;
  title: string | null;
  description: string | null;
  thumbnailPath: string | null;
  categoryId: string | null;
  similarity: number;
  matchReason?: string;
  createdAt: Date;
}

interface SearchResponse {
  query: string;
  mode: string;
  count: number;
  results: SearchResponseItem[];
}

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /**
   * Semantic search endpoint
   * GET /search?q=electricity bill from january&limit=10&mode=hybrid
   */
  @Get()
  async search(
    @Req() req: Request,
    @Query() query: SearchQueryDto,
  ): Promise<SearchResponse> {
    const user = req.user as UserEntity;

    if (!query.q || query.q.trim().length === 0) {
      throw new BadRequestException('Search query is required');
    }

    if (query.q.trim().length < 2) {
      throw new BadRequestException(
        'Search query must be at least 2 characters',
      );
    }

    const limit = Math.min(Math.max(parseInt(query.limit || '10', 10), 1), 50);
    const mode = query.mode || 'hybrid';

    let results: SearchResult[];

    if (mode === 'semantic') {
      results = await this.searchService.semanticSearch(
        user.id,
        query.q.trim(),
        limit,
      );
    } else {
      results = await this.searchService.hybridSearch(
        user.id,
        query.q.trim(),
        limit,
      );
    }

    return {
      query: query.q.trim(),
      mode,
      count: results.length,
      results: results.map((r) => ({
        id: r.document.id,
        filename: r.document.filename,
        originalName: r.document.originalName,
        title: r.document.title,
        description: r.document.description,
        thumbnailPath: r.document.thumbnailPath,
        categoryId: r.document.categoryId,
        similarity: Math.round(r.similarity * 100) / 100, // Round to 2 decimals
        matchReason: r.matchReason,
        createdAt: r.document.createdAt,
      })),
    };
  }
}
