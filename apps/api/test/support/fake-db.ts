import type { DataSource, EntityManager } from 'typeorm';
import { vi } from 'vitest';

type Rows = readonly unknown[] | ((parameters: readonly unknown[]) => readonly unknown[]);

/** A repository whose every method is a spy with a harmless default answer. */
export class FakeRepository {
  readonly findOne = vi.fn<(options: unknown) => Promise<unknown>>().mockResolvedValue(null);
  readonly find = vi.fn<(options: unknown) => Promise<unknown[]>>().mockResolvedValue([]);
  readonly findOneOrFail = vi.fn<(options: unknown) => Promise<unknown>>().mockResolvedValue({});
  readonly existsBy = vi.fn<(where: unknown) => Promise<boolean>>().mockResolvedValue(true);
  readonly countBy = vi.fn<(where: unknown) => Promise<number>>().mockResolvedValue(0);
  readonly create = vi.fn((value: unknown) => value);
  readonly save = vi.fn((value: unknown) =>
    Promise.resolve(
      Array.isArray(value) ? value : { id: 'generated-id', ...(value as Record<string, unknown>) },
    ),
  );
  readonly update = vi
    .fn<(where: unknown, changes: unknown) => Promise<{ affected: number }>>()
    .mockResolvedValue({ affected: 1 });
  readonly delete = vi
    .fn<(where: unknown) => Promise<{ affected: number }>>()
    .mockResolvedValue({ affected: 1 });
}

/**
 * Stands in for a `DataSource` in unit tests: raw SQL is answered by the first rule whose pattern
 * matches, repositories are spies, and a transaction runs its callback on the same manager. It
 * checks a service's decisions; what the SQL really does is proven by the PostgreSQL suites.
 */
export class FakeDb {
  readonly statements: { readonly sql: string; readonly parameters: readonly unknown[] }[] = [];
  private readonly rules: { readonly pattern: RegExp; readonly rows: Rows }[] = [];
  private readonly repositories = new Map<unknown, FakeRepository>();

  readonly query = vi.fn((sql: string, parameters: readonly unknown[] = []) => {
    this.statements.push({ sql, parameters });
    const rule = this.rules.find(({ pattern }) => pattern.test(sql));
    if (rule === undefined) return Promise.resolve([]);
    return Promise.resolve(typeof rule.rows === 'function' ? rule.rows(parameters) : rule.rows);
  });

  readonly manager = {
    query: this.query,
    getRepository: (entity: unknown) => this.repository(entity),
  } as unknown as EntityManager;

  readonly transaction = vi.fn(<T>(work: (manager: EntityManager) => Promise<T>) =>
    work(this.manager),
  );

  getRepository(entity: unknown): FakeRepository {
    return this.repository(entity);
  }

  /** Later rules win, so a test can override a default answer. */
  when(pattern: RegExp, rows: Rows): this {
    this.rules.unshift({ pattern, rows });
    return this;
  }

  repository(entity: unknown): FakeRepository {
    let repository = this.repositories.get(entity);
    if (repository === undefined) {
      repository = new FakeRepository();
      this.repositories.set(entity, repository);
    }
    return repository;
  }

  ran(pattern: RegExp): boolean {
    return this.statements.some(({ sql }) => pattern.test(sql));
  }

  parametersOf(pattern: RegExp): readonly unknown[] | undefined {
    return this.statements.find(({ sql }) => pattern.test(sql))?.parameters;
  }

  asDataSource(): DataSource {
    return this as unknown as DataSource;
  }
}
