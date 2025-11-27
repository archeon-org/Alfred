import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClassificationService } from './classification.service';

@Module({
  imports: [ConfigModule],
  providers: [ClassificationService],
  exports: [ClassificationService],
})
export class ClassificationModule {}
