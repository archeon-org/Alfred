import { Tag } from '@archeon-org/types';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  ManyToMany,
  CreateDateColumn,
  JoinColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from '../user/user.entity';
import { DocumentEntity } from '../document/document.entity';

@Entity('tags')
export class TagEntity implements Tag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ default: '#94A3B8' })
  color: string;

  @Column({ default: true })
  isSystemDefault: boolean;

  // --- Relationships ---
  @Column({ nullable: true })
  userId: string;

  @ManyToOne(() => UserEntity, (user) => user.tags, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @ManyToMany(() => DocumentEntity, (doc) => doc.tags)
  documents: DocumentEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
