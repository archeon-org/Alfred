import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { OauthStartQueryDto } from '@api/modules/auth/api/dto/oauth-start-query.dto';

async function isValidReturnTo(returnTo: string): Promise<boolean> {
  const dto = plainToInstance(OauthStartQueryDto, { returnTo });
  return (await validate(dto)).length === 0;
}

describe('OauthStartQueryDto', () => {
  it('accepts only local application paths as post-login destinations', async () => {
    await expect(isValidReturnTo('/app/team?tab=agents')).resolves.toBe(true);
    await expect(isValidReturnTo('https://attacker.example/path')).resolves.toBe(false);
    await expect(isValidReturnTo('//attacker.example/path')).resolves.toBe(false);
    await expect(isValidReturnTo('/\\attacker.example/path')).resolves.toBe(false);
    await expect(isValidReturnTo('/\t//attacker.example/path')).resolves.toBe(false);
  });
});
