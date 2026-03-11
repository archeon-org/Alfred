import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { TagService } from './tag.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  ApiCreateTagDocs,
  ApiListTagsDocs,
  ApiTagControllerDocs,
} from './tag.docs';

@ApiTagControllerDocs()
@Controller('tags')
@UseGuards(JwtAuthGuard)
export class TagController {
  constructor(private readonly tagService: TagService) {}

  @Get()
  @ApiListTagsDocs()
  findAll(@Request() req) {
    return this.tagService.findAll(req.user.id);
  }

  @Post()
  @ApiCreateTagDocs()
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
