import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ok } from '../../common/api-response';
import { Public } from '../../common/decorators/public.decorator';
import {
  GoogleOauthCallbackThrottlerGuard,
  GoogleOauthStartThrottlerGuard,
  RefreshThrottlerGuard,
} from '../../common/guards/alfred-throttler.guard';
import { SameOriginGuard } from '../../common/guards/same-origin.guard';
import { RequiresFeature } from '../feature-flags/requires-feature.decorator';
import { AuthService } from './auth.service';
import { OauthCallbackQueryDto } from './dto/oauth-callback-query.dto';
import { OauthStartQueryDto } from './dto/oauth-start-query.dto';
import { AuthCookieService } from './services/auth-cookie.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly cookies: AuthCookieService,
  ) {}

  @Public()
  @RequiresFeature('googleOAuth')
  @UseGuards(GoogleOauthStartThrottlerGuard)
  @Get('google/start')
  async startGoogleLogin(
    @Query() query: OauthStartQueryDto,
    @Res() response: Response,
  ): Promise<void> {
    const login = await this.authService.startGoogleLogin(query.returnTo);
    this.cookies.setOauthState(response, login.state);
    response.redirect(HttpStatus.FOUND, login.url);
  }

  @Public()
  @RequiresFeature('googleOAuth')
  @UseGuards(GoogleOauthCallbackThrottlerGuard)
  @Get('google/callback')
  async completeGoogleLogin(
    @Query() query: OauthCallbackQueryDto,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const cookieState = this.cookies.readOauthState(request);
    this.cookies.clearOauthState(response);

    if (query.error !== undefined) {
      const returnTo = await this.authService.completeGoogleLoginError(query.state, cookieState);
      response.redirect(
        HttpStatus.FOUND,
        this.authService.createFrontendCallbackErrorUrl(query.error, returnTo),
      );
      return;
    }

    if (query.code === undefined) {
      throw new BadRequestException('OAuth authorization code or error is required');
    }

    const session = await this.authService.completeGoogleLogin(
      query.code,
      query.state,
      cookieState,
    );
    this.cookies.setRefreshToken(response, session.refreshToken);
    response.redirect(
      HttpStatus.FOUND,
      this.authService.createFrontendCallbackUrl(session.returnTo),
    );
  }

  @Public()
  @UseGuards(SameOriginGuard, RefreshThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = this.cookies.readRefreshToken(request);
    if (refreshToken === undefined) {
      this.cookies.clearRefreshToken(response);
      throw new UnauthorizedException('Refresh session required');
    }

    try {
      const session = await this.authService.refresh(refreshToken);
      this.cookies.setRefreshToken(response, session.refreshToken);
      return ok({ accessToken: session.accessToken, user: session.user });
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        this.cookies.clearRefreshToken(response);
      }
      throw error;
    }
  }

  @Public()
  @UseGuards(SameOriginGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout(this.cookies.readRefreshToken(request));
    this.cookies.clearRefreshToken(response);
  }
}
