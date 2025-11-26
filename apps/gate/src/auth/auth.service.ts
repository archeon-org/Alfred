// filepath: /Users/mustaphaelhachmimahti/Desktop/workspace/personal/archeon/archeon/apps/gate/src/auth/auth.service.ts
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { GoogleVerifyDto, RequestOtpDto, VerifyOtpDto } from './dto/auth.dto';
import { ConfigService } from '@nestjs/config';
import { UserService } from 'src/user/user.service';
import { JwtService } from '@nestjs/jwt';
import { User } from '@archeon-org/types';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  public async creationAccessToken(user: User): Promise<string> {
    this.logger.debug(`Creating access token for user: ${user.id}`);

    try {
      const payload = { sub: user.id };
      const token = await this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('ACCESS_TOKEN_SECRET'),
        expiresIn: +this.configService.get<string>('ACCESS_TOKEN_EXPIRATION')!,
      });

      this.logger.debug(
        `Access token created successfully for user: ${user.id}`,
      );
      return token;
    } catch (error) {
      this.logger.error(
        `Failed to create access token for user ${user.id}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private async fetchGoogleUserInfo(googleAccessToken: string): Promise<any> {
    this.logger.debug('Fetching Google user info...');

    const response = await fetch(
      `https://www.googleapis.com/oauth2/v2/userinfo?access_token=${googleAccessToken}`,
    );

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`Google API error: ${response.status} - ${errorText}`);
      throw new UnauthorizedException(
        `Invalid Google access token: ${response.status}`,
      );
    }

    const googleUserInfo = await response.json();

    this.logger.debug(
      `Google user info retrieved: ${googleUserInfo.email} (ID: ${googleUserInfo.id})`,
    );

    return googleUserInfo;
  }

  private validateEmailMatch(expectedEmail: string, actualEmail: string): void {
    if (actualEmail !== expectedEmail) {
      this.logger.warn(
        `Email mismatch - Expected: ${expectedEmail}, Got: ${actualEmail}`,
      );
      throw new UnauthorizedException(
        'Email mismatch in Google token verification',
      );
    }
  }

  private async findOrCreateUser(
    googleVerifyDto: GoogleVerifyDto,
    googleId: string,
  ): Promise<User> {
    this.logger.debug(`Looking up user by email: ${googleVerifyDto.email}`);
    let user = await this.userService.findByEmail(googleVerifyDto.email);

    if (!user) {
      this.logger.debug(
        `User not found, creating new OAuth user: ${googleVerifyDto.email}`,
      );
      const oauthDto = {
        email: googleVerifyDto.email,
        firstName: googleVerifyDto.firstName,
        lastName: googleVerifyDto.lastName,
        profilePicture: googleVerifyDto.picture,
        googleId,
      };
      user = await this.userService.createGoogleOAuthUser(oauthDto);
      this.logger.debug(`OAuth user created successfully: ${user.id}`);
    } else {
      this.logger.debug(`Existing user found: ${user.id}`);
    }

    return user;
  }

  public async verifyGoogleToken(
    googleVerifyDto: GoogleVerifyDto,
  ): Promise<{ accessToken: string; isOnboarded: boolean }> {
    this.logger.debug(
      `Verifying Google token for email: ${googleVerifyDto.email}`,
    );

    try {
      // Fetch and validate Google user info
      const googleUserInfo = await this.fetchGoogleUserInfo(
        googleVerifyDto.googleAccessToken,
      );

      // Verify email matches
      this.validateEmailMatch(googleVerifyDto.email, googleUserInfo.email);

      // Find or create user
      const user = await this.findOrCreateUser(
        googleVerifyDto,
        googleUserInfo.id,
      );

      // Generate access token
      const accessToken = await this.creationAccessToken(user);
      this.logger.debug(
        `Google token verification successful for user: ${user.id}`,
      );

      await this.userService.updateLastLogin(user.id);

      return { accessToken, isOnboarded: user.isOnboarded };
    } catch (error) {
      this.logger.error(
        `Google token verification failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  public async requestOtp(dto: RequestOtpDto): Promise<void> {
    const user = await this.userService.findByEmail(dto.email);
    if (!user) {
      this.logger.warn(`OTP requested for non-existent email: ${dto.email}`);
      return;
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hash = crypto.createHash('sha256').update(otp).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    await this.userService.updateOtp(user.id, hash, expiresAt);

    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(`================================================`);
      this.logger.log(`OTP for ${dto.email}: ${otp}`);
      this.logger.log(`================================================`);
    }
  }

  public async verifyOtp(
    dto: VerifyOtpDto,
  ): Promise<{ accessToken: string; isOnboarded: boolean }> {
    const user = await this.userService.findByEmailWithOtp(dto.email);
    if (!user || !user.otpHash || !user.otpExpiresAt) {
      throw new UnauthorizedException('Invalid OTP');
    }

    if (user.otpExpiresAt < new Date()) {
      throw new UnauthorizedException('OTP expired');
    }

    const hash = crypto.createHash('sha256').update(dto.otp).digest('hex');
    if (hash !== user.otpHash) {
      throw new UnauthorizedException('Invalid OTP');
    }

    await this.userService.clearOtp(user.id);
    await this.userService.updateLastLogin(user.id);

    const accessToken = await this.creationAccessToken(user);
    return { accessToken, isOnboarded: user.isOnboarded };
  }
}
