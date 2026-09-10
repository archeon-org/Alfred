import { Module } from '@nestjs/common';
import { WorkspacesService } from './application/workspaces.service';

@Module({ providers: [WorkspacesService], exports: [WorkspacesService] })
export class WorkspacesModule {}
