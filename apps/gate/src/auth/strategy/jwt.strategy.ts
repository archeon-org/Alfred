import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';

import { UserEntity } from '../../user/user.entity';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../../user/user.service';

export interface Payload {
  sub: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly userService: UserService,
    private readonly configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get('ACCESS_TOKEN_SECRET'),
      ignoreExpiration: configService.get('IGNORE_JWT_EXPIRATION') === 'true',
    });
  }

  async validate(payload: Payload): Promise<Partial<UserEntity> | null> {
    const user = await this.userService.findById(payload.sub);

    if (!user) return null;
    return user;
  }
}
