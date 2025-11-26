import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';

import { UserEntity } from '../../user/user.entity';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';

export interface Payload {
  sub: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get('ACCESS_TOKEN_SECRET'),
      ignoreExpiration: configService.get('IGNORE_JWT_EXPIRATION') === 'true',
    });
  }

  async validate(payload: Payload): Promise<Partial<UserEntity> | null> {
    const user = await this.dataSource.manager
      .getRepository(UserEntity)
      .findOne({ where: { id: payload.sub } });

    if (!user) return null;
    return user;
  }
}
