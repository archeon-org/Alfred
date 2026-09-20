import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { SkillWriteInput } from '@alfred/contracts';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { expect } from 'vitest';
import { configureApplication } from '@api/bootstrap';
import { ApiExceptionFilter } from '@api/common/filters/api-exception.filter';
import { AccessTokenGuard } from '@api/common/guards/access-token.guard';
import { IdempotencyModule } from '@api/common/idempotency/idempotency.module';
import { databaseEntities } from '@api/database/typeorm.options';
import { ContextModule } from '@api/modules/context/context.module';
import { ConversationsModule } from '@api/modules/conversations/conversations.module';
import { FeatureFlagGuard } from '@api/modules/feature-flags/feature-flag.guard';
import { FeatureFlagsModule } from '@api/modules/feature-flags/feature-flags.module';
import { FEATURE_FLAG_ENVIRONMENT_KEYS } from '@api/modules/feature-flags/feature-flags.types';
import { ProjectsModule } from '@api/modules/projects/projects.module';
import { SkillsModule } from '@api/modules/skills/skills.module';
import { TenantEntity } from '@api/modules/tenants/tenant.entity';
import { UserEntity } from '@api/modules/users/user.entity';
import { addWorkspaceMembership, removeTenantWorkspaces } from '../../../support/workspace.fixture';

export interface Envelope {
  readonly success: boolean;
  readonly data?: Record<string, unknown> & { items?: Record<string, unknown>[] };
  readonly error?: { readonly code: string };
}

export function skillPackage(
  name = 'test-skill',
  instructions = 'Use the supplied method.',
): SkillWriteInput {
  const description = 'Fixture skill';
  return {
    name,
    description,
    files: [
      {
        path: 'SKILL.md',
        mediaType: 'text/markdown',
        contentBase64: Buffer.from(
          `---\nname: ${name}\ndescription: ${description}\n---\n${instructions}`,
        ).toString('base64'),
      },
    ],
  };
}

export class SkillsPostgresFixture {
  app!: INestApplication;
  db!: DataSource;
  url!: string;
  defaultTenantId!: string;
  private readonly users = new Set<string>();
  private readonly tenants = new Set<string>();

  async start(databaseUrl: string, skillsEnabled = true, quota = 26214400): Promise<void> {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          entities: [...databaseEntities],
          installExtensions: false,
          migrationsRun: false,
          retryAttempts: 0,
          synchronize: false,
          type: 'postgres',
          url: databaseUrl,
        }),
        JwtModule.register({ secret: 'test-only-postgres-skills-secret' }),
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              NODE_ENV: 'test',
              API_PREFIX: 'api',
              TRUST_PROXY_HOPS: 0,
              API_CORS_ORIGINS: ['http://localhost:5173'],
              // Every registered flag is explicit, so the fixture never depends on a private .env.
              ...Object.fromEntries(
                Object.values(FEATURE_FLAG_ENVIRONMENT_KEYS).map((key) => [key, false]),
              ),
              FEATURE_SKILLS_ENABLED: skillsEnabled,
              SKILLS_MAX_TOTAL_BYTES_PER_USER: quota,
            }),
          ],
        }),
        IdempotencyModule,
        FeatureFlagsModule,
        ContextModule,
        ProjectsModule,
        ConversationsModule,
        SkillsModule,
      ],
      providers: [
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        { provide: APP_GUARD, useClass: AccessTokenGuard },
        { provide: APP_GUARD, useClass: FeatureFlagGuard },
      ],
    }).compile();
    this.app = module.createNestApplication({ logger: false });
    configureApplication(this.app);
    await this.app.listen(0, '127.0.0.1');
    const address = (this.app.getHttpServer() as { address(): AddressInfo }).address();
    this.url = `http://127.0.0.1:${address.port}/api`;
    this.db = this.app.get(DataSource);
    this.defaultTenantId = (
      await this.db.getRepository(TenantEntity).findOneByOrFail({ slug: 'default' })
    ).id;
  }

  async close(): Promise<void> {
    if (this.db?.isInitialized) {
      for (const id of this.users) await this.db.getRepository(UserEntity).delete(id);
      for (const id of this.tenants) {
        await removeTenantWorkspaces(this.db, id);
        await this.db.getRepository(TenantEntity).delete(id);
      }
    }
    await this.app?.close();
  }

  async tenant(): Promise<string> {
    const id = randomUUID();
    this.tenants.add(id);
    await this.db
      .getRepository(TenantEntity)
      .insert({ id, name: 'Skills tenant', slug: `skills-${id}` });
    return id;
  }

  async user(tenantId = this.defaultTenantId): Promise<{ id: string; token: string }> {
    const id = randomUUID();
    this.users.add(id);
    await this.db.getRepository(UserEntity).insert({
      id,
      tenantId,

      displayName: 'Skills fixture',
      email: `${id}@example.test`,
    });
    await addWorkspaceMembership(this.db, tenantId, id);
    const token = this.app.get(JwtService).sign({
      email: `${id}@example.test`,
      role: 'user',
      sid: randomUUID(),
      sub: id,
      typ: 'access',
    });
    return { id, token };
  }

  async api(
    method: string,
    path: string,
    token: string,
    body?: unknown,
  ): Promise<{ status: number; body: Envelope | null }> {
    const response = await fetch(`${this.url}${path}`, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
    const text = await response.text();
    return { status: response.status, body: text === '' ? null : (JSON.parse(text) as Envelope) };
  }

  async create(token: string, input = skillPackage()): Promise<string> {
    const result = await this.api('POST', '/skills', token, input);
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    return result.body!.data!.id as string;
  }

  async conversation(token: string): Promise<string> {
    const result = await this.api('POST', '/conversations', token, {});
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    return result.body!.data!.id as string;
  }

  async publish(token: string, id: string, expectedVersion = 1): Promise<void> {
    const result = await this.api('POST', `/skills/${id}/publish`, token, { expectedVersion });
    expect(result.status, JSON.stringify(result.body)).toBe(200);
  }
}
