import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';

import { AuthorizedUser } from '../common/decorators/user-type.decorator';
import { UserType } from '@archeon-org/types';
import { AdminService } from './admin.service';
import {
  ApiAdminAddCreditsPackDocs,
  ApiAdminAddCustomCreditsDocs,
  ApiAdminBackfillDocs,
  ApiAdminControllerDocs,
  ApiAdminGetUserDocs,
  ApiAdminListUsersDocs,
  ApiAdminResetDailySearchDocs,
  ApiAdminSetBonusSearchesDocs,
  ApiAdminSetCustomStorageDocs,
  ApiAdminSetStoragePackDocs,
  ApiAdminStatsDocs,
  ApiAdminUpgradeTierDocs,
} from './admin.docs';
import {
  AddCreditsPackDto,
  AddCustomCreditsDto,
  SetBonusSearchesDto,
  SetCustomStorageDto,
  SetStoragePackDto,
  TriggerRagBackfillDto,
  UpgradeTierDto,
} from './dto/admin.dto';

@ApiAdminControllerDocs()
@Controller('admin')
@AuthorizedUser(UserType.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  @ApiAdminListUsersDocs()
  async getUsers(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('search') search?: string,
  ) {
    return this.adminService.getUsers(page, limit, search);
  }

  @Get('users/:userId')
  @ApiAdminGetUserDocs()
  async getUser(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.adminService.getUserDetails(userId);
  }

  @Post('users/:userId/upgrade-tier')
  @ApiAdminUpgradeTierDocs()
  async upgradeTier(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: UpgradeTierDto,
  ) {
    return this.adminService.setUserTier(userId, body.tier);
  }

  @Post('users/:userId/add-credits')
  @ApiAdminAddCreditsPackDocs()
  async addCredits(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: AddCreditsPackDto,
  ) {
    return this.adminService.addCreditPack(userId, body.pack);
  }

  @Post('users/:userId/add-credits-custom')
  @ApiAdminAddCustomCreditsDocs()
  async addCustomCredits(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: AddCustomCreditsDto,
  ) {
    return this.adminService.addCustomCredits(
      userId,
      body.credits,
      body.bonusSearches ?? 0,
      body.reason ?? 'Admin adjustment',
    );
  }

  @Post('users/:userId/set-bonus-searches')
  @ApiAdminSetBonusSearchesDocs()
  async setCustomBonusSearches(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: SetBonusSearchesDto,
  ) {
    return this.adminService.setCustomBonusSearches(
      userId,
      body.bonusSearches,
      body.reason ?? 'Admin adjustment',
    );
  }

  @Post('users/:userId/set-storage')
  @ApiAdminSetStoragePackDocs()
  async setStorage(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: SetStoragePackDto,
  ) {
    return this.adminService.setStoragePack(userId, body.pack);
  }

  @Post('users/:userId/set-storage-custom')
  @ApiAdminSetCustomStorageDocs()
  async setCustomStorage(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: SetCustomStorageDto,
  ) {
    return this.adminService.setCustomStorage(
      userId,
      body.storageGb,
      body.reason ?? 'Admin adjustment',
    );
  }

  @Post('users/:userId/reset-daily-search')
  @ApiAdminResetDailySearchDocs()
  async resetDailySearch(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.adminService.resetDailySearch(userId);
  }

  @Get('stats')
  @ApiAdminStatsDocs()
  async getStats() {
    return this.adminService.getSubscriptionStats();
  }

  @Post('rag/backfill')
  @ApiAdminBackfillDocs()
  async triggerRagBackfill(@Body() body: TriggerRagBackfillDto) {
    return this.adminService.triggerRagBackfill(
      body.requestedBy ?? 'admin',
      body.batchSize ?? 100,
    );
  }
}
