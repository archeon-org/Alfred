import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface DatabaseHealth {
  readonly database: { readonly status: 'down' | 'up' };
}

@Injectable()
export class DatabaseHealthIndicator {
  constructor(private readonly dataSource: DataSource) {}

  async check(): Promise<DatabaseHealth> {
    try {
      await this.dataSource.query('SELECT 1');
      return { database: { status: 'up' } };
    } catch {
      return { database: { status: 'down' } };
    }
  }
}
