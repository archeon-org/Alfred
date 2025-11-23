import { Injectable } from '@nestjs/common';
import { UserRepository } from './user.repository';
import { UserEntity } from './user.entity';
import { UserOAuthCreateDto } from '../auth/dto/auth.dto';

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  public findById(id: string): Promise<UserEntity | null> {
    return this.userRepository.findById(id);
  }

  public findByEmail(email: string): Promise<UserEntity | null> {
    return this.userRepository.findByEmail(email);
  }

  public createGoogleOAuthUser(
    oauthDto: UserOAuthCreateDto,
  ): Promise<UserEntity> {
    return this.userRepository.createGoogleOAuthUser(oauthDto);
  }

  public updateLastLogin(userId: string): Promise<void> {
    return this.userRepository.updateLastLogin(userId);
  }
}
