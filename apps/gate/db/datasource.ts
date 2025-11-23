import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';
import { ConfigService } from '@nestjs/config';

config();

const configService = new ConfigService();

export const dataSourceOptions: DataSourceOptions = {
  // @ts-expect-error // TypeORM expects predefined strings for type
  type: configService.getOrThrow<string>('DATABASE_TYPE'),
  host: configService.getOrThrow<string>('DATABASE_HOST'),
  port: configService.getOrThrow<number>('DATABASE_PORT'),
  username: configService.getOrThrow<string>('DATABASE_USERNAME'),
  password: configService.getOrThrow<string>('DATABASE_PASSWORD'),
  database: configService.getOrThrow<string>('DATABASE_NAME'),
  entities: ['dist/**/*.entity.js'],
  migrations: ['dist/db/migrations/*.js'],
  migrationsTableName: 'migrations',
  migrationsRun: false,
  synchronize: false,
  logging: process.env.ENV !== 'production',
  extra: {
    connectionLimit: 10, // Adjust based on your database connection pool requirements
  },
};

const dataSource = new DataSource(dataSourceOptions);

// You might want to do
// dataSource.initialize()
// but I found mine working regardless of it

export default dataSource;
