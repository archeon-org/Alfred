import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ok } from '../../../common/api-response';
import { Public } from '../../../common/decorators/public.decorator';
import {
  OauthCallbackThrottlerGuard,
  OauthStartThrottlerGuard,
  RefreshThrottlerGuard,
} from '../../../common/guards/alfred-throttler.guard';
import { SameOriginGuard } from '../../../common/guards/same-origin.guard';
import { RequiresFeature } from '../../feature-flags/requires-feature.decorator';
import { AuthService } from '../application/auth.service';
import { DocCompleteGoogleLogin, DocCompleteProviderLogin } from './auth-callback.openapi';
import {
  DocListAuthProviders,
  DocStartGoogleLogin,
  DocStartProviderLogin,
} from './auth-login.openapi';
import { DocLogout, DocRefreshSession } from './auth-session.openapi';
import { AuthCookieService } from './cookies/auth-cookie.service';
import { AuthProviderParamDto } from './dto/auth-provider-param.dto';
import { OauthCallbackQueryDto } from './dto/oauth-callback-query.dto';
import { OauthStartQueryDto } from './dto/oauth-start-query.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly cookies: AuthCookieService,
  ) {}

  @Public()
  @Get('providers')
  @DocListAuthProviders()
  listProviders() {
    return ok(this.authService.listProviders());
  }

  @Public()
  @UseGuards(OauthStartThrottlerGuard)
  @Get('providers/:provider/start')
  @DocStartProviderLogin()
  async startProviderLogin(
    @Param() parameters: AuthProviderParamDto,
    @Query() query: OauthStartQueryDto,
    @Res() response: Response,
  ): Promise<void> {
    await this.startLogin(parameters.provider, query, response);
  }

  @Public()
  @UseGuards(OauthCallbackThrottlerGuard)
  @Get('providers/:provider/callback')
  @DocCompleteProviderLogin()
  async completeProviderLogin(
    @Param() parameters: AuthProviderParamDto,
    @Query() query: OauthCallbackQueryDto,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    await this.completeLogin(parameters.provider, query, request, response);
  }

  @Public()
  @RequiresFeature('googleOAuth')
  @UseGuards(OauthStartThrottlerGuard)
  @Get('google/start')
  @DocStartGoogleLogin()
  async startGoogleLogin(
    @Query() query: OauthStartQueryDto,
    @Res() response: Response,
  ): Promise<void> {
    await this.startLogin('google', query, response);
  }

  @Public()
  @RequiresFeature('googleOAuth')
  @UseGuards(OauthCallbackThrottlerGuard)
  @Get('google/callback')
  @DocCompleteGoogleLogin()
  async completeGoogleLogin(
    @Query() query: OauthCallbackQueryDto,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    await this.completeLogin('google', query, request, response);
  }

  private async startLogin(
    providerKey: string,
    query: OauthStartQueryDto,
    response: Response,
  ): Promise<void> {
    const login = await this.authService.startLogin(providerKey, query.returnTo);
    this.cookies.setOauthState(response, login.state);
    response.redirect(HttpStatus.FOUND, login.url);
  }

  private async completeLogin(
    providerKey: string,
    query: OauthCallbackQueryDto,
    request: Request,
    response: Response,
  ): Promise<void> {
    const cookieState = this.cookies.readOauthState(request);
    this.cookies.clearOauthState(response);

    if (query.error !== undefined) {
      const returnTo = await this.authService.completeLoginError(
        providerKey,
        query.state,
        cookieState,
      );
      response.redirect(
        HttpStatus.FOUND,
        this.authService.createFrontendCallbackErrorUrl(query.error, returnTo),
      );
      return;
    }

    if (query.code === undefined) {
      throw new BadRequestException('OAuth authorization code or error is required');
    }

    const session = await this.authService.completeLogin(
      providerKey,
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
  @DocRefreshSession()
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
  @DocLogout()
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout(this.cookies.readRefreshToken(request));
    this.cookies.clearRefreshToken(response);
  }
}
