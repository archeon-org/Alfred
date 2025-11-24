import { Address, AuthProvider, User, UserType } from '@archeon-org/types';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { DocumentEntity } from '../document/document.entity';

@Entity('users')
export class UserEntity implements User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ nullable: true })
  profilePicture?: string;

  @Column({ type: 'bigint', default: 0 })
  storageUsed: number;

  @Column({ type: 'bigint', default: 2147483648 }) // 2GB default
  storageLimit: number;

  @Column({ default: 0 })
  searchCount: number;

  @Column({ type: 'jsonb', nullable: true })
  address?: Address;

  @Column({ type: 'enum', enum: UserType, default: UserType.USER })
  role: UserType; // USER or ADMIN

  @Column({ nullable: true, select: false })
  refreshToken?: string;

  @Column({ type: 'enum', enum: AuthProvider })
  provider: AuthProvider;

  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt: Date;

  @Column({ nullable: true, select: false })
  otpHash?: string;

  @Column({ type: 'timestamp', nullable: true })
  otpExpiresAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => DocumentEntity, (document) => document.user)
  documents: DocumentEntity[];
}
