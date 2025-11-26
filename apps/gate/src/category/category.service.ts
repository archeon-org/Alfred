import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CategoryEntity } from './category.entity';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { paginate, PaginateQuery, Paginated } from 'nestjs-paginate';

@Injectable()
export class CategoryService {
  private readonly logger = new Logger(CategoryService.name);

  constructor(
    @InjectRepository(CategoryEntity)
    private readonly categoryRepository: Repository<CategoryEntity>,
  ) {}

  async createCustom(
    data: CreateCategoryDto | Partial<CategoryEntity>,
    userId: string,
  ): Promise<CategoryEntity> {
    this.logger.log(`Creating custom category for user ${userId}`);
    const category = this.categoryRepository.create({
      ...data,
      userId,
      isSystemDefault: false,
    });
    return this.categoryRepository.save(category);
  }

  async createSystem(
    data: Partial<CategoryEntity>,
    userId: string,
  ): Promise<CategoryEntity> {
    this.logger.log(`Creating system category for user ${userId}`);
    const category = this.categoryRepository.create({
      ...data,
      userId,
      isSystemDefault: true,
    });
    return this.categoryRepository.save(category);
  }

  async createManySystem(
    data: Partial<CategoryEntity>[],
    userId: string,
  ): Promise<CategoryEntity[]> {
    this.logger.log(
      `Creating ${data.length} system categories for user ${userId}`,
    );
    const categories = data.map((item) =>
      this.categoryRepository.create({
        ...item,
        userId,
        isSystemDefault: true,
      }),
    );
    return this.categoryRepository.save(categories);
  }

  async findAll(
    userId: string,
    query: PaginateQuery,
  ): Promise<Paginated<CategoryEntity>> {
    this.logger.debug(`Finding all categories for user ${userId}`);
    return paginate<CategoryEntity>(query, this.categoryRepository as any, {
      sortableColumns: ['id', 'name', 'createdAt'],
      nullSort: 'last',
      defaultSortBy: [['createdAt', 'DESC']],
      searchableColumns: ['name'],
      where: { userId },
    });
  }

  async findOne(id: string, userId: string): Promise<CategoryEntity> {
    this.logger.debug(`Finding category ${id} for user ${userId}`);
    const category = await this.categoryRepository.findOne({
      where: { id, userId },
    });
    if (!category) {
      this.logger.warn(`Category not found: ${id}`);
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  async update(
    id: string,
    updateCategoryDto: UpdateCategoryDto,
    userId: string,
  ): Promise<CategoryEntity> {
    this.logger.log(`Updating category ${id} for user ${userId}`);
    const category = await this.findOne(id, userId);
    Object.assign(category, updateCategoryDto);
    return this.categoryRepository.save(category);
  }

  async remove(id: string, userId: string): Promise<void> {
    this.logger.log(`Removing category ${id} for user ${userId}`);
    const category = await this.findOne(id, userId);
    await this.categoryRepository.remove(category);
  }
}
