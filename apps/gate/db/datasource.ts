import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';
import {
  UserEntity,
  DocumentEntity,
  DocumentChunkEntity,
  CategoryEntity,
  TagEntity,
  TemplateEntity,
  TemplateCategoryEntity,
  TemplateTagEntity,
  NotificationEntity,
} from '@archeon-org/database';

config();

export const dataSourceOptions: DataSourceOptions = {
  // @ts-expect-error // TypeORM expects predefined strings for type
  type: process.env.DATABASE_TYPE || 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  username: process.env.DATABASE_USERNAME || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'postgres',
  entities: [
    UserEntity,
    DocumentEntity,
    DocumentChunkEntity,
    CategoryEntity,
    TagEntity,
    TemplateEntity,
    TemplateCategoryEntity,
    TemplateTagEntity,
    NotificationEntity,
  ],
  migrations: ['dist/db/migrations/*.js'],
  migrationsTableName: 'migrations',
  migrationsRun: false,
  synchronize: false,
  logging: false,
  extra: {
    connectionLimit: 10,
  },
};

const dataSource = new DataSource(dataSourceOptions);

export default dataSource;
