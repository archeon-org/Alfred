import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import {
  DocumentEntity,
  DocumentEmbeddingEntity,
  CategoryEntity,
} from '@archeon-org/database';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { ChatSearchController } from './chat-search.controller';
import { ChatSearchService } from './chat-search.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      DocumentEntity,
      DocumentEmbeddingEntity,
      CategoryEntity,
    ]),
  ],
  controllers: [SearchController, ChatSearchController],
  providers: [SearchService, ChatSearchService],
  exports: [SearchService, ChatSearchService],
})
export class SearchModule {}
