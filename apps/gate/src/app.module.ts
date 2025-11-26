import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSourceOptions } from 'db/datasource';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { APP_GUARD } from '@nestjs/core';
import { UserTypeGuard } from './auth/guards/user-type.guard';
import { HealthModule } from './health/health.module';
import { DocumentModule } from './document/document.module';
import { CategoryModule } from './category/category.module';
import { TagModule } from './tag/tag.module';
import { TemplateModule } from './template/template.module';
import { NotificationModule } from './notification/notification.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRoot(dataSourceOptions as TypeOrmModule),
    UserModule,
    AuthModule,
    HealthModule,
    DocumentModule,
    CategoryModule,
    TagModule,
    TemplateModule,

    NotificationModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: UserTypeGuard,
    },
  ],
})
export class AppModule {}
