import { Inject, Injectable, Scope } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';

import { UserEntity } from './user.entity';
import { UserOAuthCreateDto } from '../auth/dto/auth.dto';
import { AuthProvider } from '@archeon-org/types';
import { REQUEST } from '@nestjs/core';
import { BaseRepository } from '../common/interceptors/transaction/base-repository';
import { Request } from 'express';

@Injectable({ scope: Scope.REQUEST })
export class UserRepository extends BaseRepository {
  constructor(
    @InjectDataSource() dataSource: DataSource,
    @Inject(REQUEST) req: Request,
  ) {
    super(dataSource, req);
  }

  public async findById(id: string): Promise<UserEntity | null> {
    return this.getRepository(UserEntity).findOne({ where: { id } });
  }

  public async findByEmail(email: string): Promise<UserEntity | null> {
    return this.getRepository(UserEntity).findOne({ where: { email } });
  }

  public async createGoogleOAuthUser(
    oauthDto: UserOAuthCreateDto,
  ): Promise<UserEntity> {
    const user = this.getRepository(UserEntity).create({
      ...oauthDto,
      provider: AuthProvider.GOOGLE,
    });
    return this.getRepository(UserEntity).save(user);
  }

  public updateLastLogin(userId: string): Promise<void> {
    return this.getRepository(UserEntity)
      .update(userId, { lastLoginAt: new Date() })
      .then(() => {});
  }
}
