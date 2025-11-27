import { Injectable, Logger } from '@nestjs/common';
import { UserRepository } from './user.repository';
import { UserEntity } from '@archeon-org/database';
import { UserOAuthCreateDto } from '../auth/dto/auth.dto';
import { UpdateUserDto } from './dto/user.dto';
import { mergePreferences } from '@archeon-org/types';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(private readonly userRepository: UserRepository) {}

  public findById(id: string): Promise<UserEntity | null> {
    this.logger.debug(`Finding user by ID: ${id}`);
    return this.userRepository.findById(id);
  }

  public findByEmail(email: string): Promise<UserEntity | null> {
    this.logger.debug(`Finding user by email: ${email}`);
    return this.userRepository.findByEmail(email);
  }

  public createGoogleOAuthUser(
    oauthDto: UserOAuthCreateDto,
  ): Promise<UserEntity> {
    this.logger.log(`Creating Google OAuth user: ${oauthDto.email}`);
    return this.userRepository.createGoogleOAuthUser(oauthDto);
  }

  public updateLastLogin(userId: string): Promise<void> {
    this.logger.debug(`Updating last login for user: ${userId}`);
    return this.userRepository.updateLastLogin(userId);
  }

  public updateOtp(
    userId: string,
    otpHash: string,
    expiresAt: Date,
  ): Promise<void> {
    this.logger.debug(`Updating OTP for user: ${userId}`);
    return this.userRepository.updateOtp(userId, otpHash, expiresAt);
  }

  public findByEmailWithOtp(email: string): Promise<UserEntity | null> {
    this.logger.debug(`Finding user by email with OTP: ${email}`);
    return this.userRepository.findByEmailWithOtp(email);
  }

  public clearOtp(userId: string): Promise<void> {
    this.logger.debug(`Clearing OTP for user: ${userId}`);
    return this.userRepository.clearOtp(userId);
  }

  public async update(
    userId: string,
    data: UpdateUserDto,
  ): Promise<UserEntity> {
    this.logger.log(`Updating user: ${userId}`);

    // If preferences are being updated, merge them properly
    if (data.preferences) {
      const currentUser = await this.userRepository.findById(userId);
      if (currentUser) {
        const mergedPreferences = mergePreferences(
          currentUser.preferences,
          data.preferences,
        );

        return this.userRepository.update(userId, {
          ...data,
          preferences: mergedPreferences,
        });
      }
    }

    return this.userRepository.update(userId, data);
  }
}
