import { Inject, Injectable, Scope } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import { BaseRepository } from '../common/interceptors/transaction/base-repository';
import { TemplateEntity } from './template.entity';

@Injectable({ scope: Scope.REQUEST })
export class TemplateRepository extends BaseRepository {
  constructor(
    @InjectDataSource() dataSource: DataSource,
    @Inject(REQUEST) req: Request,
  ) {
    super(dataSource, req);
  }

  public async create(data: Partial<TemplateEntity>): Promise<TemplateEntity> {
    const template = this.getRepository(TemplateEntity).create(data);
    return this.getRepository(TemplateEntity).save(template);
  }

  public async findAll(): Promise<TemplateEntity[]> {
    return this.getRepository(TemplateEntity).find({
      relations: ['categories', 'tags'],
    });
  }

  public async findById(id: string): Promise<TemplateEntity | null> {
    return this.getRepository(TemplateEntity).findOne({
      where: { id },
      relations: ['categories', 'tags'],
    });
  }

  public async update(
    id: string,
    data: Partial<TemplateEntity>,
  ): Promise<TemplateEntity> {
    await this.getRepository(TemplateEntity).update(id, data);
    return this.findById(id);
  }

  public async delete(id: string): Promise<void> {
    await this.getRepository(TemplateEntity).delete(id);
  }
}
