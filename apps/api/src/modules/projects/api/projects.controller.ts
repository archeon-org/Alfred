import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ok } from '../../../common/api-response';
import type { AuthPrincipal } from '../../../common/auth/auth-principal';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Idempotent } from '../../../common/idempotency/idempotent.decorator';
import { ListQueryDto } from '../../../common/pagination/list-query.dto';
import { ResourceIdPipe } from '../../../common/validation/resource-id.pipe';
import { ProjectsService } from '../application/projects.service';
import { PROJECT_RESOURCE } from '../domain/project';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

const projectId = new ResourceIdPipe(PROJECT_RESOURCE);

@ApiTags('projects')
@ApiBearerAuth('bearerAuth')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  @HttpCode(201)
  @Idempotent()
  async create(@CurrentUser() principal: AuthPrincipal, @Body() body: CreateProjectDto) {
    return ok(await this.projects.create(principal, body));
  }

  @Get()
  async list(@CurrentUser() principal: AuthPrincipal, @Query() query: ListQueryDto) {
    return ok(await this.projects.list(principal, query));
  }

  @Get(':id')
  async get(@CurrentUser() principal: AuthPrincipal, @Param('id', projectId) id: string) {
    return ok(await this.projects.get(principal, id));
  }

  @Patch(':id')
  async update(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', projectId) id: string,
    @Body() body: UpdateProjectDto,
  ) {
    return ok(await this.projects.update(principal, id, body));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', projectId) id: string,
  ): Promise<void> {
    await this.projects.remove(principal, id);
  }
}
