import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SkillLifecycle1789250000000 implements MigrationInterface {
  readonly name = 'SkillLifecycle1789250000000';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query('ALTER TABLE api_skills ADD COLUMN enabled boolean NOT NULL DEFAULT true');
    // Historical snapshot creation times were not recorded: use migration time for backfill.
    await runner.query(
      'ALTER TABLE api_skill_versions ADD COLUMN created_at timestamptz NOT NULL DEFAULT now()',
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM api_skills) THEN
        RAISE EXCEPTION 'Export or delete authored skills before reverting lifecycle metadata';
      END IF;
    END $$`);
    await runner.query('ALTER TABLE api_skill_versions DROP COLUMN created_at');
    await runner.query('ALTER TABLE api_skills DROP COLUMN enabled');
  }
}
