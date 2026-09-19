import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { ok } from '../../../common/api-response';
import type { AuthPrincipal } from '../../../common/auth/auth-principal';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ResourceIdPipe } from '../../../common/validation/resource-id.pipe';
import { RequiresFeature } from '../../feature-flags/requires-feature.decorator';
import { FileFoldersService, FOLDER_RESOURCE } from '../application/file-folders.service';
import { FolderCreateDto, FolderUpdateDto } from './file.dto';

const folderId = new ResourceIdPipe(FOLDER_RESOURCE);

@ApiTags('files')
@ApiBearerAuth('bearerAuth')
@RequiresFeature('fileUploads')
@Controller('files/folders')
export class FileFoldersController {
  constructor(private readonly folders: FileFoldersService) {}

  @Get() async list(@CurrentUser() user: AuthPrincipal) {
    return ok({ items: await this.folders.list(user) });
  }

  @Post() @HttpCode(201) async create(
    @CurrentUser() user: AuthPrincipal,
    @Body() body: FolderCreateDto,
  ) {
    return ok(await this.folders.create(user, body));
  }

  @Patch(':id') async update(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', folderId) id: string,
    @Body() body: FolderUpdateDto,
  ) {
    return ok(await this.folders.update(user, id, body));
  }

  @Delete(':id') @HttpCode(204) async remove(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', folderId) id: string,
  ): Promise<void> {
    await this.folders.remove(user, id);
  }
}
