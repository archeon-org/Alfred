import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Explicitly authorized removal of associations only; parent resources remain untouched. */
export class RemoveConversationSkills1789270000000 implements MigrationInterface {
  readonly name = 'RemoveConversationSkills1789270000000';

  async up(runner: QueryRunner): Promise<void> {
    // No CASCADE: unexpected dependencies must fail instead of deleting unrelated objects.
    await runner.query('DROP TABLE "api_conversation_skills"');
  }

  async down(runner: QueryRunner): Promise<void> {
    // Schema rollback recreates an empty relation; deleted associations cannot be recovered.
    await runner.query(`CREATE TABLE "api_conversation_skills" (
      "conversation_id" uuid NOT NULL, "skill_id" uuid NOT NULL,
      CONSTRAINT "pk_conversation_skills" PRIMARY KEY ("conversation_id", "skill_id"),
      CONSTRAINT "fk_conversation_skills_skill" FOREIGN KEY ("skill_id") REFERENCES "api_skills" ("id") ON DELETE CASCADE,
      CONSTRAINT "fk_conversation_skills_conversation" FOREIGN KEY ("conversation_id") REFERENCES "api_conversations" ("id") ON DELETE CASCADE
    )`);
    await runner.query(
      'CREATE INDEX "idx_conversation_skills_skill" ON "api_conversation_skills" ("skill_id")',
    );
  }
}
