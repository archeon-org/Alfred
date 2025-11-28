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
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      DocumentEntity,
      DocumentEmbeddingEntity,
      CategoryEntity,
    ]),
    SubscriptionModule,
  ],
  controllers: [SearchController, ChatSearchController],
  providers: [SearchService, ChatSearchService],
  exports: [SearchService, ChatSearchService],
})
export class SearchModule {}
