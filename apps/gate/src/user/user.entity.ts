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
import { CategoryEntity } from '../category/category.entity';
import { TagEntity } from '../tag/tag.entity';

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

  @Column({ nullable: true })
  pushToken?: string;

  @Column({ type: 'bigint', default: 0 })
  storageUsed: number;

  @Column({ type: 'bigint', default: 2147483648 })
  storageLimit: number;

  @Column({ type: 'jsonb', default: {} })
  preferences: Record<string, any>;

  @Column({ default: 0 })
  searchCount: number;

  @Column({ type: 'jsonb', nullable: true })
  address?: Address;

  @Column({ type: 'enum', enum: UserType, default: UserType.USER })
  role: UserType;

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

  @Column({ default: false })
  isOnboarded: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => DocumentEntity, (document) => document.user)
  documents: DocumentEntity[];

  @OneToMany(() => CategoryEntity, (category) => category.user)
  categories: CategoryEntity[];

  @OneToMany(() => TagEntity, (tag) => tag.user)
  tags: TagEntity[];
}
