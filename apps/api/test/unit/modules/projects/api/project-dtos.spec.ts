import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateProjectDto } from '@api/modules/projects/api/dto/create-project.dto';
import { ListProjectsQueryDto } from '@api/modules/projects/api/dto/list-projects-query.dto';
import { UpdateProjectDto } from '@api/modules/projects/api/dto/update-project.dto';

async function errorsOf(dto: object): Promise<string[]> {
  return (await validate(dto)).map((error) => error.property);
}

describe('project request DTOs', () => {
  it('trims the name and normalizes document line endings without other side effects', async () => {
    const dto = plainToInstance(CreateProjectDto, {
      context: 'Ligne 1\r\nLigne 2',
      description: 'Une\r\ndescription',
      name: '  Refonte du portail  ',
    });

    expect(await errorsOf(dto)).toEqual([]);
    expect(dto).toEqual({
      context: 'Ligne 1\nLigne 2',
      description: 'Une\ndescription',
      name: 'Refonte du portail',
    });
  });

  it.each<[string | number, string]>([
    ['', 'empty'],
    ['   ', 'blank'],
    ['a'.repeat(161), 'too long'],
    ['Nom\navec retour', 'control character'],
    [42, 'not a string'],
  ])('rejects %j as a project name (%s)', async (name) => {
    expect(await errorsOf(plainToInstance(CreateProjectDto, { name }))).toEqual(['name']);
  });

  it('bounds the description by characters and the context by UTF-8 bytes', async () => {
    const tooLongDescription = plainToInstance(CreateProjectDto, {
      description: 'é'.repeat(2001),
      name: 'Projet',
    });
    expect(await errorsOf(tooLongDescription)).toEqual(['description']);

    const okDescription = plainToInstance(CreateProjectDto, {
      description: 'é'.repeat(2000),
      name: 'Projet',
    });
    expect(await errorsOf(okDescription)).toEqual([]);

    const tooLargeContext = plainToInstance(CreateProjectDto, {
      context: 'é'.repeat(32_769),
      name: 'Projet',
    });
    expect(await errorsOf(tooLargeContext)).toEqual(['context']);
  });

  it('rejects NUL characters that PostgreSQL text columns cannot store', async () => {
    const dto = plainToInstance(CreateProjectDto, { context: 'a\u0000b', name: 'Projet' });

    expect(await errorsOf(dto)).toEqual(['context']);
  });

  it('reads the pinned filter as a boolean and rejects anything else', async () => {
    const pinned = plainToInstance(ListProjectsQueryDto, { limit: '3', pinned: 'true' });
    expect(await errorsOf(pinned)).toEqual([]);
    expect(pinned).toMatchObject({ limit: 3, pinned: true });
    expect(plainToInstance(ListProjectsQueryDto, { pinned: 'false' }).pinned).toBe(false);
    expect(await errorsOf(plainToInstance(ListProjectsQueryDto, {}))).toEqual([]);
    expect(await errorsOf(plainToInstance(ListProjectsQueryDto, { pinned: 'maybe' }))).toEqual([
      'pinned',
    ]);
  });

  it('accepts a partial update and validates each provided field', async () => {
    expect(await errorsOf(plainToInstance(UpdateProjectDto, { context: '' }))).toEqual([]);
    expect(await errorsOf(plainToInstance(UpdateProjectDto, {}))).toEqual([]);
    expect(await errorsOf(plainToInstance(UpdateProjectDto, { name: ' ' }))).toEqual(['name']);
  });

  it.each(['name', 'description', 'context'])(
    'rejects an explicit null %s instead of letting it reach the service',
    async (field) => {
      expect(await errorsOf(plainToInstance(UpdateProjectDto, { [field]: null }))).toEqual([field]);
      expect(
        await errorsOf(
          plainToInstance(CreateProjectDto, {
            ...(field === 'name' ? {} : { name: 'Projet' }),
            [field]: null,
          }),
        ),
      ).toEqual([field]);
    },
  );
});
