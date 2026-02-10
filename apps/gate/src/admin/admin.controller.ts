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
import {
  UserType,
  SubscriptionTier,
  CreditPack,
  StoragePack,
} from '@archeon-org/types';
import { AdminService } from './admin.service';

@Controller('admin')
@AuthorizedUser(UserType.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  async getUsers(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('search') search?: string,
  ) {
    return this.adminService.getUsers(page, limit, search);
  }

  @Get('users/:userId')
  async getUser(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.adminService.getUserDetails(userId);
  }

  @Post('users/:userId/upgrade-tier')
  async upgradeTier(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body('tier') tier: SubscriptionTier,
  ) {
    return this.adminService.setUserTier(userId, tier);
  }

  @Post('users/:userId/add-credits')
  async addCredits(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body('pack') pack: CreditPack,
  ) {
    return this.adminService.addCreditPack(userId, pack);
  }

  @Post('users/:userId/add-credits-custom')
  async addCustomCredits(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body('credits') credits: number,
    @Body('bonusSearches') bonusSearches: number = 0,
    @Body('reason') reason: string = 'Admin adjustment',
  ) {
    return this.adminService.addCustomCredits(
      userId,
      credits,
      bonusSearches,
      reason,
    );
  }

  @Post('users/:userId/set-bonus-searches')
  async setCustomBonusSearches(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body('bonusSearches') bonusSearches: number,
    @Body('reason') reason: string = 'Admin adjustment',
  ) {
    return this.adminService.setCustomBonusSearches(
      userId,
      bonusSearches,
      reason,
    );
  }

  @Post('users/:userId/set-storage')
  async setStorage(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body('pack') pack: StoragePack,
  ) {
    return this.adminService.setStoragePack(userId, pack);
  }

  @Post('users/:userId/set-storage-custom')
  async setCustomStorage(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body('storageGb') storageGb: number,
    @Body('reason') reason: string = 'Admin adjustment',
  ) {
    return this.adminService.setCustomStorage(userId, storageGb, reason);
  }

  @Post('users/:userId/reset-daily-search')
  async resetDailySearch(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.adminService.resetDailySearch(userId);
  }

  @Get('stats')
  async getStats() {
    return this.adminService.getSubscriptionStats();
  }
}
