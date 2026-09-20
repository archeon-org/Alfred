import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ok } from '../../../common/api-response';
import type { AuthPrincipal } from '../../../common/auth/auth-principal';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ResourceIdPipe } from '../../../common/validation/resource-id.pipe';
import { RequiresFeature } from '../../feature-flags/requires-feature.decorator';
import { PublishedSkillsService } from '../application/published-skills.service';
import { DocGetPublishedSkill, DocListPublishedSkills } from './published-skills.openapi';
import {
  DocListSkillVersions,
  DocPublishSkill,
  DocRestoreSkillVersion,
  DocSetSkillAvailability,
} from './skill-lifecycle.openapi';
import {
  DocCreateSkill,
  DocDeleteSkill,
  DocGetSkill,
  DocListSkills,
  DocUpdateSkill,
} from './skills.openapi';
import { SkillsService } from '../application/skills.service';
import {
  PublishedSkillListQueryDto,
  SkillAvailabilityDto,
  SkillRestoreDto,
  SkillVersionsQueryDto,
  SkillListQueryDto,
  SkillUpdateDto,
  SkillVersionDto,
  SkillWriteDto,
} from './skill.dto';
const skillId = new ResourceIdPipe('skill');
@ApiTags('skills')
@ApiBearerAuth('bearerAuth')
@RequiresFeature('skills')
@Controller('skills')
export class SkillsController {
  constructor(
    private readonly skills: SkillsService,
    private readonly published: PublishedSkillsService,
  ) {}
  @Get() @DocListSkills() async list(
    @CurrentUser() user: AuthPrincipal,
    @Query() query: SkillListQueryDto,
  ) {
    return ok(await this.skills.list(user, query));
  }
  @Post() @HttpCode(201) @DocCreateSkill() async create(
    @CurrentUser() user: AuthPrincipal,
    @Body() body: SkillWriteDto,
  ) {
    return ok(await this.skills.create(user, body));
  }
  // Declared before ':id': 'published' is a fixed segment, not a skill identifier.
  @Get('published') @DocListPublishedSkills() async listPublished(
    @CurrentUser() user: AuthPrincipal,
    @Query() query: PublishedSkillListQueryDto,
  ) {
    return ok(await this.published.list(user, query));
  }
  @Get('published/:id') @DocGetPublishedSkill() async getPublished(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', skillId) id: string,
  ) {
    return ok(await this.published.get(user, id));
  }
  @Get(':id') @DocGetSkill() async get(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', skillId) id: string,
  ) {
    return ok(await this.skills.get(user, id));
  }
  @Put(':id') @DocUpdateSkill() async update(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', skillId) id: string,
    @Body() body: SkillUpdateDto,
  ) {
    return ok(await this.skills.update(user, id, body));
  }
  @Get(':id/versions') @DocListSkillVersions() async versions(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', skillId) id: string,
    @Query() query: SkillVersionsQueryDto,
  ) {
    return ok(await this.skills.versions(user, id, query));
  }
  @Post(':id/restore') @HttpCode(200) @DocRestoreSkillVersion() async restore(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', skillId) id: string,
    @Body() body: SkillRestoreDto,
  ) {
    return ok(await this.skills.restore(user, id, body));
  }
  @Put(':id/availability') @DocSetSkillAvailability() async availability(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', skillId) id: string,
    @Body() body: SkillAvailabilityDto,
  ) {
    return ok(await this.skills.availability(user, id, body));
  }
  @Post(':id/publish') @HttpCode(200) @DocPublishSkill() async publish(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', skillId) id: string,
    @Body() body: SkillVersionDto,
  ) {
    return ok(await this.skills.publish(user, id, body.expectedVersion));
  }
  @Delete(':id') @HttpCode(204) @DocDeleteSkill() async remove(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', skillId) id: string,
    @Body() body: SkillVersionDto,
  ) {
    await this.skills.remove(user, id, body.expectedVersion);
  }
}
