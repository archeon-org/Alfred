import { Inject, Injectable, Scope } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import { BaseRepository } from '../common/interceptors/transaction/base-repository';
import { DocumentEntity } from '@archeon-org/database';

@Injectable({ scope: Scope.REQUEST })
export class DocumentRepository extends BaseRepository {
  constructor(
    @InjectDataSource() dataSource: DataSource,
    @Inject(REQUEST) req: Request,
  ) {
    super(dataSource, req);
  }

  public async create(data: Partial<DocumentEntity>): Promise<DocumentEntity> {
    const document = this.getRepository(DocumentEntity).create(data);
    return this.getRepository(DocumentEntity).save(document);
  }

  public async findById(id: string): Promise<DocumentEntity | null> {
    return this.getRepository(DocumentEntity).findOne({
      where: { id },
      relations: ['category', 'tags'],
    });
  }

  public async findByIds(ids: string[]): Promise<DocumentEntity[]> {
    return this.getRepository(DocumentEntity)
      .createQueryBuilder('document')
      .where('document.id IN (:...ids)', { ids })
      .getMany();
  }

  public async findByUserId(userId: string): Promise<DocumentEntity[]> {
    return this.getRepository(DocumentEntity).find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  public async update(
    id: string,
    data: Partial<DocumentEntity> & { tagIds?: string[] },
  ): Promise<DocumentEntity> {
    const { tagIds, ...updateData } = data;

    if (Object.keys(updateData).length > 0) {
      await this.getRepository(DocumentEntity).update(id, updateData);
    }

    if (tagIds) {
      const document = await this.findById(id);
      if (document) {
        document.tags = tagIds.map((tagId) => ({ id: tagId }) as any);
        await this.getRepository(DocumentEntity).save(document);
      }
    }

    return this.findById(id);
  }

  public async updateMany(
    ids: string[],
    data: Partial<DocumentEntity>,
  ): Promise<void> {
    await this.getRepository(DocumentEntity)
      .createQueryBuilder()
      .update(DocumentEntity)
      .set(data)
      .where('id IN (:...ids)', { ids })
      .execute();
  }

  public async softDelete(id: string): Promise<void> {
    await this.getRepository(DocumentEntity).softDelete(id);
  }
}
