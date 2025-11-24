import { Inject, Injectable, Scope } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import { BaseRepository } from '../common/interceptors/transaction/base-repository';
import { DocumentEntity } from './document.entity';

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
    return this.getRepository(DocumentEntity).findOne({ where: { id } });
  }

  public async findByUserId(userId: string): Promise<DocumentEntity[]> {
    return this.getRepository(DocumentEntity).find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }
}
