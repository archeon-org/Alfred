import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PersonalContextController, ProjectContextController } from './api/context.controller';
import { ContextResolverService } from './application/context-resolver.service';
import { ContextScopeService } from './application/context-scope.service';
import { ContextService } from './application/context.service';

@Module({
  imports: [ConfigModule],
  controllers: [PersonalContextController, ProjectContextController],
  providers: [ContextScopeService, ContextService, ContextResolverService],
  exports: [ContextResolverService],
})
export class ContextModule {}
