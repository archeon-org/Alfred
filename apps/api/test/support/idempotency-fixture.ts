import type { AddressInfo } from 'node:net';
import {
  Body,
  Controller,
  HttpCode,
  Injectable,
  Post,
  type INestApplication,
  Res,
} from '@nestjs/common';
import { IsString } from 'class-validator';
import type { Response } from 'express';
import { Idempotent } from '@api/common/idempotency/idempotent.decorator';

export class FixtureDto {
  @IsString()
  name!: string;
}

@Injectable()
export class FixtureWriter {
  write: (name: string) => Promise<unknown> = (name) => Promise.resolve({ name });
}

@Controller('idempotency-fixture')
export class IdempotencyFixtureController {
  constructor(private readonly writer: FixtureWriter) {}

  @Post()
  @Idempotent()
  create(@Body() body: FixtureDto): Promise<unknown> {
    return this.writer.write(body.name);
  }

  @Post('empty')
  @HttpCode(204)
  @Idempotent()
  async empty(): Promise<void> {
    await this.writer.write('empty');
  }

  @Post('header')
  @Idempotent()
  async header(@Res({ passthrough: true }) response: Response): Promise<unknown> {
    response.setHeader('x-fixture-header', 'original-only');
    return this.writer.write('header');
  }

  @Post('plain')
  plain(@Body() body: FixtureDto): Promise<unknown> {
    return this.writer.write(body.name);
  }
}

export async function fixtureUrl(app: INestApplication): Promise<string> {
  await app.listen(0, '127.0.0.1');
  const address = (app.getHttpServer() as { address(): AddressInfo }).address();
  return `http://127.0.0.1:${address.port}/idempotency-fixture`;
}
