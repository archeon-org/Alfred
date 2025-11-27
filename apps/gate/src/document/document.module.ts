import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentController } from './document.controller';
import { DocumentService } from './document.service';
import { DocumentEntity } from '@archeon-org/database';
import { DocumentRepository } from './document.repository';
import { ConfigModule } from '@nestjs/config';
import { R2Module } from '@archeon-org/module';
import { UserModule } from '../user/user.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DocumentEntity]),
    ConfigModule,
    R2Module,
    UserModule,
    QueueModule,
  ],
  controllers: [DocumentController],
  providers: [DocumentService, DocumentRepository],
  exports: [DocumentService],
})
export class DocumentModule {}
