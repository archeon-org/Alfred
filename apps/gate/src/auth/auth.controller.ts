import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { GoogleVerifyDto, RequestOtpDto, VerifyOtpDto } from './dto/auth.dto';
import { User, SubscriptionStatus } from '@archeon-org/types';
import { AuthService } from './auth.service';
import { Public } from '../common/decorators/public.decorator';
import { SubscriptionService } from '../subscription/subscription.service';
import {
  ApiAuthControllerDocs,
  ApiGetProfileDocs,
  ApiRequestOtpDocs,
  ApiVerifyGoogleDocs,
  ApiVerifyOtpDocs,
} from './auth.docs';

interface MeResponse extends User {
  subscription: SubscriptionStatus;
}

@ApiAuthControllerDocs()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  @Get('me')
  @ApiGetProfileDocs()
  async getProfile(@Req() req: Request & { user: any }): Promise<MeResponse> {
    const user = req.user as User;
    const subscription = await this.subscriptionService.getSubscriptionStatus(
      user.id,
    );

    return {
      ...user,
      subscription,
    };
  }

  @Post('google/verify')
  @Public()
  @ApiVerifyGoogleDocs()
  async verifyGoogleToken(@Body() googleVerifyDto: GoogleVerifyDto) {
    return this.authService.verifyGoogleToken(googleVerifyDto);
  }

  @Post('otp/request')
  @Public()
  @ApiRequestOtpDocs()
  async requestOtp(@Body() dto: RequestOtpDto) {
    return this.authService.requestOtp(dto);
  }

  @Post('otp/verify')
  @Public()
  @ApiVerifyOtpDocs()
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }
}
