import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { R2Service } from './r2.service';

@Module({
  imports: [ConfigModule],
  providers: [R2Service],
  exports: [R2Service],
})
export class R2Module {}
