import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SameOriginGuard } from '../../common/guards/same-origin.guard';
import {
  OauthCallbackThrottlerGuard,
  OauthStartThrottlerGuard,
  RefreshThrottlerGuard,
} from '../../common/guards/alfred-throttler.guard';
import { UsersModule } from '../users/users.module';
import { AuthController } from './api/auth.controller';
import { AuthCookieService } from './api/cookies/auth-cookie.service';
import { AuthService } from './application/auth.service';
import { IdentityProviderRegistry } from './application/identity-provider.registry';
import { IDENTITY_PROVIDERS, type IdentityProvider } from './domain/ports/identity-provider';
import { OAUTH_STATE_PORT } from './domain/ports/oauth-state.port';
import { SESSION_PORT } from './domain/ports/session.port';
import { GoogleOidcService } from './infrastructure/identity/google-oidc.service';
import { OauthLoginStateEntity } from './infrastructure/persistence/entities/oauth-login-state.entity';
import { RefreshSessionEntity } from './infrastructure/persistence/entities/refresh-session.entity';
import { OauthStateService } from './infrastructure/persistence/oauth-state.service';
import { RefreshSessionCleanupService } from './infrastructure/persistence/refresh-session-cleanup.service';
import { RefreshSessionService } from './infrastructure/persistence/refresh-session.service';
import { SessionTokenService } from './infrastructure/security/session-token.service';

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
    {
      provide: IDENTITY_PROVIDERS,
      inject: [GoogleOidcService],
      useFactory: (google: GoogleOidcService): readonly IdentityProvider[] =>
        Object.freeze([google]),
    },
    IdentityProviderRegistry,
    OauthCallbackThrottlerGuard,
    OauthStartThrottlerGuard,
    OauthStateService,
    { provide: OAUTH_STATE_PORT, useExisting: OauthStateService },
    RefreshSessionCleanupService,
    RefreshSessionService,
    { provide: SESSION_PORT, useExisting: RefreshSessionService },
    RefreshThrottlerGuard,
    SameOriginGuard,
    SessionTokenService,
  ],
  exports: [JwtModule],
})
export class AuthModule {}
