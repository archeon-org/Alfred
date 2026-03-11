import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { DocumentEntity, CategoryEntity } from '@archeon-org/database';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { ChatSearchService } from './chat-search.service';
import { RagService } from './rag.service';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([DocumentEntity, CategoryEntity]),
    SubscriptionModule,
  ],
  controllers: [SearchController],
  providers: [SearchService, ChatSearchService, RagService],
  exports: [SearchService, ChatSearchService, RagService],
})
export class SearchModule {}
