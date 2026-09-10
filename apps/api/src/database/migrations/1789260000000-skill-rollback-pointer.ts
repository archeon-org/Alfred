import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Current and published snapshots are independent pointers after personal rollback. */
export class SkillRollbackPointer1789260000000 implements MigrationInterface {
  readonly name = 'SkillRollbackPointer1789260000000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE api_skills
      DROP CONSTRAINT chk_skills_versions,
      ADD CONSTRAINT chk_skills_versions CHECK (
        "version" > 0 AND "current_version" > 0 AND "current_version" <= "version"
        AND ("published_version" IS NULL OR ("published_version" > 0 AND "published_version" <= "version"))
      )`);
  }

  async down(runner: QueryRunner): Promise<void> {
    // One atomic ALTER refuses incompatible pointers rather than rewriting user state.
    await runner.query(`ALTER TABLE api_skills
      DROP CONSTRAINT chk_skills_versions,
      ADD CONSTRAINT chk_skills_versions CHECK (
        "version" > 0 AND "current_version" > 0 AND "current_version" <= "version"
        AND ("published_version" IS NULL OR ("published_version" > 0 AND "published_version" <= "current_version"))
      )`);
  }
}
