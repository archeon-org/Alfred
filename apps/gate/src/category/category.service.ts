import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CategoryEntity } from '@archeon-org/database';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { paginate, PaginateQuery, Paginated } from 'nestjs-paginate';
import { DocumentEntity, ProcessingStatus } from '@archeon-org/database';

@Injectable()
export class CategoryService {
  private readonly logger = new Logger(CategoryService.name);

  constructor(
    @InjectRepository(CategoryEntity)
    private readonly categoryRepository: Repository<CategoryEntity>,
    @InjectRepository(DocumentEntity)
    private readonly documentRepository: Repository<DocumentEntity>,
  ) {}

  async createCustom(
    data: CreateCategoryDto | Partial<CategoryEntity>,
    userId: string,
  ): Promise<CategoryEntity> {
    this.logger.log(`Creating custom category for user ${userId}`);

    if (data.parentId) {
      await this.validateParentCategory({
        userId,
        parentId: data.parentId,
      });
    }

    const category = this.categoryRepository.create({
      ...data,
      userId,
      isSystemDefault: false,
      order: data.order ?? 0,
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
      order: data.order ?? 0,
    });
    return this.categoryRepository.save(category);
  }

  async createSubfolder(
    parentId: string,
    data: CreateCategoryDto,
    userId: string,
  ): Promise<CategoryEntity> {
    await this.validateParentCategory({
      userId,
      parentId,
    });
    return this.createCustom(
      {
        ...data,
        parentId,
      },
      userId,
    );
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
        order: item.order ?? 0,
      }),
    );
    return this.categoryRepository.save(categories);
  }

  async findAll(
    userId: string,
    query: PaginateQuery,
    hideEmpty: boolean = false,
  ): Promise<Paginated<CategoryEntity & { documentCount?: number }>> {
    this.logger.debug(
      `Finding all categories for user ${userId} (hideEmpty: ${hideEmpty})`,
    );

    const queryBuilder = this.categoryRepository.createQueryBuilder('category');
    queryBuilder
      .where('category.userId = :userId', { userId })
      .loadRelationCountAndMap('category.documentCount', 'category.documents');

    if (hideEmpty) {
      queryBuilder.andWhere((qb) => {
        const subQuery = qb
          .subQuery()
          .select('1')
          .from(DocumentEntity, 'document')
          .where('document.categoryId = category.id')
          .getQuery();
        return `EXISTS ${subQuery}`;
      });
    }

    return paginate<CategoryEntity>(query, queryBuilder as any, {
      sortableColumns: ['id', 'name', 'createdAt', 'order'],
      nullSort: 'last',
      defaultSortBy: [
        ['order', 'ASC'],
        ['createdAt', 'DESC'],
      ],
      searchableColumns: ['name'],
    });
  }

  async findTree(
    userId: string,
    hideEmpty: boolean = false,
  ): Promise<
    (CategoryEntity & { documentCount?: number; children?: CategoryEntity[] })[]
  > {
    this.logger.debug(
      `Finding category tree for user ${userId} (hideEmpty: ${hideEmpty})`,
    );

    const categories = (await this.categoryRepository
      .createQueryBuilder('category')
      .where('category.userId = :userId', { userId })
      .loadRelationCountAndMap('category.documentCount', 'category.documents')
      .orderBy('category.order', 'ASC')
      .addOrderBy('category.createdAt', 'ASC')
      .getMany()) as (CategoryEntity & {
      documentCount?: number;
      children?: CategoryEntity[];
    })[];

    const nodesById = new Map<
      string,
      CategoryEntity & { children: CategoryEntity[] }
    >();
    for (const category of categories) {
      nodesById.set(category.id, {
        ...category,
        children: [],
      });
    }

    const roots: (CategoryEntity & {
      children: CategoryEntity[];
      documentCount?: number;
    })[] = [];
    for (const category of nodesById.values()) {
      if (category.parentId && nodesById.has(category.parentId)) {
        nodesById.get(category.parentId)!.children.push(category);
      } else {
        roots.push(category);
      }
    }

    const sortNodes = (
      nodes: (CategoryEntity & {
        children: CategoryEntity[];
        documentCount?: number;
      })[],
    ) => {
      nodes.sort((a, b) => {
        const orderDelta = (a.order ?? 0) - (b.order ?? 0);
        if (orderDelta !== 0) {
          return orderDelta;
        }
        return a.name.localeCompare(b.name);
      });
      for (const node of nodes) {
        sortNodes(
          node.children as (CategoryEntity & {
            children: CategoryEntity[];
            documentCount?: number;
          })[],
        );
      }
    };

    sortNodes(roots);

    const aggregateDocumentCounts = (
      nodes: (CategoryEntity & {
        children: CategoryEntity[];
        documentCount?: number;
      })[],
    ): number => {
      let total = 0;
      for (const node of nodes) {
        const ownCount = node.documentCount ?? 0;
        const childCount = aggregateDocumentCounts(
          node.children as (CategoryEntity & {
            children: CategoryEntity[];
            documentCount?: number;
          })[],
        );
        const mergedCount = ownCount + childCount;
        node.documentCount = mergedCount;
        total += mergedCount;
      }
      return total;
    };

    aggregateDocumentCounts(roots);

    if (!hideEmpty) {
      return roots;
    }

    const prune = (
      nodes: (CategoryEntity & {
        children: CategoryEntity[];
        documentCount?: number;
      })[],
    ): (CategoryEntity & {
      children: CategoryEntity[];
      documentCount?: number;
    })[] => {
      return nodes
        .map((node) => ({
          ...node,
          children: prune(
            node.children as (CategoryEntity & {
              children: CategoryEntity[];
              documentCount?: number;
            })[],
          ),
        }))
        .filter(
          (node) => (node.documentCount ?? 0) > 0 || node.children.length > 0,
        );
    };

    return prune(roots);
  }

  async findSubfolders(
    parentId: string,
    userId: string,
    hideEmpty: boolean = false,
  ): Promise<(CategoryEntity & { documentCount?: number })[]> {
    await this.findOne(parentId, userId);

    const queryBuilder = this.categoryRepository.createQueryBuilder('category');
    queryBuilder
      .where('category.userId = :userId', { userId })
      .andWhere('category.parentId = :parentId', { parentId })
      .loadRelationCountAndMap('category.documentCount', 'category.documents')
      .orderBy('category.order', 'ASC')
      .addOrderBy('category.createdAt', 'ASC');

    if (hideEmpty) {
      queryBuilder.andWhere((qb) => {
        const subQuery = qb
          .subQuery()
          .select('1')
          .from(DocumentEntity, 'document')
          .where('document.categoryId = category.id')
          .getQuery();
        return `EXISTS ${subQuery}`;
      });
    }

    return queryBuilder.getMany() as Promise<
      (CategoryEntity & { documentCount?: number })[]
    >;
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

    if (updateCategoryDto.parentId === id) {
      throw new BadRequestException('A category cannot be its own parent');
    }

    if (updateCategoryDto.parentId) {
      const childrenCount = await this.categoryRepository.count({
        where: { parentId: id, userId },
      });
      if (childrenCount > 0) {
        throw new BadRequestException(
          'Cannot move a parent category with existing subfolders under another parent',
        );
      }

      await this.validateParentCategory({
        userId,
        parentId: updateCategoryDto.parentId,
        currentCategoryId: id,
      });
    }

    Object.assign(category, updateCategoryDto);
    return this.categoryRepository.save(category);
  }

  async remove(id: string, userId: string): Promise<void> {
    this.logger.log(`Removing category ${id} for user ${userId}`);
    const category = await this.findOne(id, userId);

    // Update documents in this category to PENDING status
    await this.documentRepository.update(
      { categoryId: id, userId },
      { processingStatus: ProcessingStatus.PENDING },
    );

    await this.categoryRepository.remove(category);
  }

  private async validateParentCategory({
    userId,
    parentId,
    currentCategoryId,
  }: {
    userId: string;
    parentId: string;
    currentCategoryId?: string;
  }): Promise<CategoryEntity> {
    if (currentCategoryId && parentId === currentCategoryId) {
      throw new BadRequestException('A category cannot be its own parent');
    }

    const parent = await this.categoryRepository.findOne({
      where: { id: parentId, userId },
    });

    if (!parent) {
      throw new NotFoundException('Parent category not found');
    }

    if (parent.parentId) {
      throw new BadRequestException(
        'Subfolders can only be created under root categories',
      );
    }

    return parent;
  }
}
