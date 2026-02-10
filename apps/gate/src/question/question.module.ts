import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QuestionController } from './question.controller';
import { QuestionService } from './question.service';

@Module({
  imports: [ConfigModule],
  controllers: [QuestionController],
  providers: [QuestionService],
  exports: [QuestionService],
})
export class QuestionModule {}
