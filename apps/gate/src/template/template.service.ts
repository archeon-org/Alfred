import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { TemplateRepository } from './template.repository';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/template.dto';
import { TemplateEntity } from '@archeon-org/database';
import { CategoryService } from '../category/category.service';
import { TagService } from '../tag/tag.service';
import { UserService } from '../user/user.service';
import { paginate, PaginateQuery, Paginated } from 'nestjs-paginate';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TemplateCategoryEntity } from '@archeon-org/database';

@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);

  constructor(
    @InjectRepository(TemplateEntity)
    private readonly templateRepo: Repository<TemplateEntity>,
    @InjectRepository(TemplateCategoryEntity)
    private readonly templateCategoryRepo: Repository<TemplateCategoryEntity>,
    private readonly templateRepository: TemplateRepository,
    private readonly categoryService: CategoryService,
    private readonly tagService: TagService,
    private readonly userService: UserService,
  ) {}

  async create(createTemplateDto: CreateTemplateDto): Promise<TemplateEntity> {
    this.logger.log(`Creating template: ${createTemplateDto.name}`);
    return this.templateRepository.create(createTemplateDto);
  }

  async findAll(query: PaginateQuery): Promise<Paginated<TemplateEntity>> {
    this.logger.debug('Finding all templates');
    return paginate<TemplateEntity>(query, this.templateRepo as any, {
      sortableColumns: ['id', 'name', 'order'],
      nullSort: 'last',
      defaultSortBy: [['order', 'ASC']],
      searchableColumns: ['name', 'description'],
      select: ['id', 'name', 'description', 'icon', 'order'],
      relations: ['categories', 'tags'],
    });
  }

  async findOne(id: string): Promise<TemplateEntity> {
    this.logger.debug(`Finding template by ID: ${id}`);
    const template = await this.templateRepository.findById(id);
    if (!template) {
      this.logger.warn(`Template not found: ${id}`);
      throw new NotFoundException('Template not found');
    }
    return template;
  }

  async update(
    id: string,
    updateTemplateDto: UpdateTemplateDto,
  ): Promise<TemplateEntity> {
    this.logger.log(`Updating template: ${id}`);
    await this.findOne(id);
    return this.templateRepository.update(id, updateTemplateDto);
  }

  async remove(id: string): Promise<void> {
    this.logger.log(`Removing template: ${id}`);
    await this.findOne(id);
    await this.templateRepository.delete(id);
  }

  async applyTemplate(templateId: string, userId: string): Promise<void> {
    this.logger.log(`Applying template ${templateId} for user ${userId}`);
    const template = await this.templateRepository.findById(templateId);
    if (!template) {
      this.logger.warn(`Template not found for application: ${templateId}`);
      throw new NotFoundException('Template not found');
    }

    this.logger.debug(`Copying ${template.categories.length} categories`);
    const sortedCategories = [...template.categories].sort((a, b) => {
      const levelDelta = (a.level ?? 1) - (b.level ?? 1);
      if (levelDelta !== 0) {
        return levelDelta;
      }
      const orderDelta = (a.order ?? 0) - (b.order ?? 0);
      if (orderDelta !== 0) {
        return orderDelta;
      }
      return a.name.localeCompare(b.name);
    });

    const templateToUserCategoryMap = new Map<string, string>();

    for (const category of sortedCategories) {
      const resolvedParentId = category.parentTemplateCategoryId
        ? templateToUserCategoryMap.get(category.parentTemplateCategoryId)
        : undefined;

      const createdCategory = await this.categoryService.createSystem(
        {
          name: category.name,
          icon: category.icon,
          color: category.color,
          order: category.order ?? 0,
          parentId: resolvedParentId,
        },
        userId,
      );

      templateToUserCategoryMap.set(category.id, createdCategory.id);
    }

    this.logger.debug(`Copying ${template.tags.length} tags`);
    const tagsData = template.tags.map((tag) => ({
      name: tag.name,
      color: tag.color,
      order: tag.order ?? 0,
    }));
    await this.tagService.createManySystem(tagsData, userId);

    this.logger.log(`Marking user ${userId} as onboarded`);
    await this.userService.update(userId, { isOnboarded: true });
  }

  async findCategories(
    templateId: string,
    query: PaginateQuery,
  ): Promise<Paginated<TemplateCategoryEntity>> {
    this.logger.debug(`Finding categories for template: ${templateId}`);
    return paginate<TemplateCategoryEntity>(
      query,
      this.templateCategoryRepo as any,
      {
        where: { template: { id: templateId } },
        sortableColumns: ['level', 'order', 'name'],
        defaultSortBy: [
          ['level', 'ASC'],
          ['order', 'ASC'],
        ],
        searchableColumns: ['name'],
      },
    );
  }
}
