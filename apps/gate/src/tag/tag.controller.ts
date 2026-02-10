import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { TagService } from './tag.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('tags')
@ApiBearerAuth('JWT-auth')
@Controller('tags')
@UseGuards(JwtAuthGuard)
export class TagController {
  constructor(private readonly tagService: TagService) {}

  @Get()
  @ApiOperation({
    summary: 'List tags',
    description: 'Retrieves all tags for the user.',
  })
  @ApiOkResponse({
    description: 'List of tags',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          color: { type: 'string', nullable: true },
          isDefault: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  findAll(@Request() req) {
    return this.tagService.findAll(req.user.id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create tag',
    description: 'Creates a new tag or returns existing tag with same name.',
  })
  @ApiBody({ type: CreateTagDto })
  @ApiCreatedResponse({
    description: 'Tag created or existing tag returned',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        color: { type: 'string', nullable: true },
        isDefault: { type: 'boolean' },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async create(@Request() req, @Body() createTagDto: CreateTagDto) {
    const existing = await this.tagService.findByName(
      createTagDto.name,
      req.user.id,
    );
    if (existing) {
      return existing;
    }
    return this.tagService.createCustom(createTagDto, req.user.id);
  }
}
