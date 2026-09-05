import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthPrincipal } from '../../../common/auth/auth-principal';

export interface OpaqueRefreshToken {
  readonly hash: string;
  readonly raw: string;
}

@Injectable()
export class SessionTokenService {
  constructor(private readonly jwtService: JwtService) {}

  createRefreshToken(): OpaqueRefreshToken {
    const raw = randomBytes(32).toString('base64url');
    return Object.freeze({ hash: this.hashRefreshToken(raw), raw });
  }

  hashRefreshToken(raw: string): string {
    return createHash('sha256').update(raw, 'utf8').digest('hex');
  }

  issueAccessToken(principal: AuthPrincipal): Promise<string> {
    return this.jwtService.signAsync({
      email: principal.email,
      role: principal.role,
      sid: principal.sessionId,
      sub: principal.id,
      typ: 'access',
    });
  }
}
