import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserEntity } from './user.entity';
import { UserOAuthCreateDto } from '../auth/dto/auth.dto';
import { AuthProvider } from '@archeon-org/types';

@Injectable()
export class UserRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repository: Repository<UserEntity>,
  ) {}

  public async findById(id: string): Promise<UserEntity | null> {
    return this.repository.findOne({ where: { id } });
  }

  public async findByEmail(email: string): Promise<UserEntity | null> {
    return this.repository.findOne({ where: { email } });
  }

  public async createGoogleOAuthUser(
    oauthDto: UserOAuthCreateDto,
  ): Promise<UserEntity> {
    const user = this.repository.create({
      ...oauthDto,
      provider: AuthProvider.GOOGLE,
    });
    return this.repository.save(user);
  }

  public updateLastLogin(userId: string): Promise<void> {
    return this.repository
      .update(userId, { lastLoginAt: new Date() })
      .then(() => {});
  }
}
