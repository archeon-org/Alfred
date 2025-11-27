import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { DocumentEmbeddingEntity } from '@archeon-org/database';
import { EmbeddingService } from './embedding.service';

@Module({
  imports: [TypeOrmModule.forFeature([DocumentEmbeddingEntity]), ConfigModule],
  providers: [EmbeddingService],
  exports: [EmbeddingService],
})
export class EmbeddingModule {}
