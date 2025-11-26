import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentController } from './document.controller';
import { DocumentService } from './document.service';
import { DocumentEntity } from './document.entity';
import { DocumentRepository } from './document.repository';
import { ConfigModule } from '@nestjs/config';
import { R2Module } from '../common/modules/r2/r2.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DocumentEntity]),
    ConfigModule,
    R2Module,
    UserModule,
  ],
  controllers: [DocumentController],
  providers: [DocumentService, DocumentRepository],
  exports: [DocumentService],
})
export class DocumentModule {}
