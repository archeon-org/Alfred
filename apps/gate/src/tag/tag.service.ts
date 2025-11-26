import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TagEntity } from './tag.entity';

@Injectable()
export class TagService {
  private readonly logger = new Logger(TagService.name);

  constructor(
    @InjectRepository(TagEntity)
    private readonly tagRepository: Repository<TagEntity>,
  ) {}

  async createCustom(
    data: Partial<TagEntity>,
    userId: string,
  ): Promise<TagEntity> {
    this.logger.log(`Creating custom tag for user ${userId}`);
    const tag = this.tagRepository.create({
      ...data,
      userId,
      isSystemDefault: false,
    });
    return this.tagRepository.save(tag);
  }

  async createSystem(
    data: Partial<TagEntity>,
    userId: string,
  ): Promise<TagEntity> {
    this.logger.log(`Creating system tag for user ${userId}`);
    const tag = this.tagRepository.create({
      ...data,
      userId,
      isSystemDefault: true,
    });
    return this.tagRepository.save(tag);
  }

  async createManySystem(
    data: Partial<TagEntity>[],
    userId: string,
  ): Promise<TagEntity[]> {
    this.logger.log(`Creating ${data.length} system tags for user ${userId}`);
    const tags = data.map((item) =>
      this.tagRepository.create({
        ...item,
        userId,
        isSystemDefault: true,
      }),
    );
    return this.tagRepository.save(tags);
  }

  async findAll(userId: string): Promise<TagEntity[]> {
    return this.tagRepository.find({
      where: { userId },
      order: { name: 'ASC' },
    });
  }

  async findByName(name: string, userId: string): Promise<TagEntity | null> {
    return this.tagRepository.findOne({
      where: { name, userId },
    });
  }
}
