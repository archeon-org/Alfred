import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { GoogleVerifyDto } from './dto/auth.dto';
import { User } from '@archeon-org/types';
import { AuthService } from './auth.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  getProfile(@Req() req: Request & { user: any }) {
    return req.user as User;
  }

  @Post('google/verify')
  @Public()
  async verifyGoogleToken(@Body() googleVerifyDto: GoogleVerifyDto) {
    return this.authService.verifyGoogleToken(googleVerifyDto);
  }
}
