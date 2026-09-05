import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SameOriginGuard } from '../../common/guards/same-origin.guard';
import {
  GoogleOauthCallbackThrottlerGuard,
  GoogleOauthStartThrottlerGuard,
  RefreshThrottlerGuard,
} from '../../common/guards/alfred-throttler.guard';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OauthLoginStateEntity } from './entities/oauth-login-state.entity';
import { RefreshSessionEntity } from './entities/refresh-session.entity';
import { AuthCookieService } from './services/auth-cookie.service';
import { GoogleOidcService } from './services/google-oidc.service';
import { OauthStateService } from './services/oauth-state.service';
import { RefreshSessionService } from './services/refresh-session.service';
import { RefreshSessionCleanupService } from './services/refresh-session-cleanup.service';
import { SessionTokenService } from './services/session-token.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([OauthLoginStateEntity, RefreshSessionEntity]),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('AUTH_JWT_SECRET'),
        signOptions: {
          audience: config.getOrThrow<string>('AUTH_JWT_AUDIENCE'),
          expiresIn: config.getOrThrow<number>('AUTH_ACCESS_TOKEN_TTL_SECONDS'),
          issuer: config.getOrThrow<string>('AUTH_JWT_ISSUER'),
        },
        verifyOptions: {
          audience: config.getOrThrow<string>('AUTH_JWT_AUDIENCE'),
          issuer: config.getOrThrow<string>('AUTH_JWT_ISSUER'),
        },
      }),
    }),
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthCookieService,
    AuthService,
    GoogleOidcService,
    GoogleOauthCallbackThrottlerGuard,
    GoogleOauthStartThrottlerGuard,
    OauthStateService,
    RefreshSessionCleanupService,
    RefreshSessionService,
    RefreshThrottlerGuard,
    SameOriginGuard,
    SessionTokenService,
  ],
  exports: [JwtModule],
})
export class AuthModule {}
