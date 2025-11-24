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

  public async updateOtp(
    userId: string,
    otpHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.getRepository(UserEntity).update(userId, {
      otpHash,
      otpExpiresAt: expiresAt,
    });
  }

  public async findByEmailWithOtp(email: string): Promise<UserEntity | null> {
    return this.getRepository(UserEntity)
      .createQueryBuilder('user')
      .addSelect('user.otpHash')
      .where('user.email = :email', { email })
      .getOne();
  }

  public async clearOtp(userId: string): Promise<void> {
    await this.getRepository(UserEntity).update(userId, {
      otpHash: null,
      otpExpiresAt: null,
    });
  }

  public async update(
    userId: string,
    data: Partial<UserEntity>,
  ): Promise<UserEntity> {
    await this.getRepository(UserEntity).update(userId, data);
    return this.findById(userId);
  }
}
