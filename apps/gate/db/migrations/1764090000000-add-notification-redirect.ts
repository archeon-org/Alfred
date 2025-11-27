import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationRedirect1764090000000
  implements MigrationInterface
{
  name = 'AddNotificationRedirect1764090000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "redirect" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "redirect"`,
    );
  }
}
