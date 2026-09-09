import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { MoveConversationDto } from '@api/modules/conversations/api/dto/move-conversation.dto';
import { UpdateConversationDto } from '@api/modules/conversations/api/dto/update-conversation.dto';
import { CreateConversationDto } from '@api/modules/conversations/api/dto/create-conversation.dto';
import { ListConversationsQueryDto } from '@api/modules/conversations/api/dto/list-conversations-query.dto';

async function errorsOf(dto: object): Promise<string[]> {
  return (await validate(dto)).map((error) => error.property);
}

describe('conversation request DTOs', () => {
  it('requires a UUID destination for a move', async () => {
    for (const projectId of [undefined, null, '', 'not-a-uuid'])
      expect(await errorsOf(plainToInstance(MoveConversationDto, { projectId }))).toEqual([
        'projectId',
      ]);
    expect(
      await errorsOf(
        plainToInstance(MoveConversationDto, { projectId: '0b6e1a9e-0a7f-4c26-9f5b-2f1a2c3d4e5f' }),
      ),
    ).toEqual([]);
  });

  it('requires a usable title on rename, rejecting missing, null and unknown fields', async () => {
    for (const title of [undefined, null, '', '   ', 'a\tb', 'x'.repeat(161)]) {
      expect(await errorsOf(plainToInstance(UpdateConversationDto, { title }))).toContain('title');
    }
    const dto = plainToInstance(UpdateConversationDto, { title: '  Nouveau  ' });
    expect(await errorsOf(dto)).toEqual([]);
    expect(dto.title).toBe('Nouveau');
  });

  it('defaults to ten and validates the project kind filter', async () => {
    expect(plainToInstance(ListConversationsQueryDto, {}).limit).toBe(10);
    for (const projectKind of ['implicit', 'named'])
      expect(await errorsOf(plainToInstance(ListConversationsQueryDto, { projectKind }))).toEqual(
        [],
      );
    expect(
      await errorsOf(plainToInstance(ListConversationsQueryDto, { projectKind: 'other' })),
    ).toEqual(['projectKind']);
  });

  it('accepts an empty body for a standalone chat and trims a provided title', async () => {
    expect(await errorsOf(plainToInstance(CreateConversationDto, {}))).toEqual([]);

    const dto = plainToInstance(CreateConversationDto, {
      projectId: '0b6e1a9e-0a7f-4c26-9f5b-2f1a2c3d4e5f',
      title: '  Analyse  ',
    });
    expect(await errorsOf(dto)).toEqual([]);
    expect(dto.title).toBe('Analyse');
  });

  it('rejects a malformed project identifier and an unusable title', async () => {
    expect(await errorsOf(plainToInstance(CreateConversationDto, { projectId: 'x' }))).toEqual([
      'projectId',
    ]);
    expect(await errorsOf(plainToInstance(CreateConversationDto, { title: 'a\tb' }))).toEqual([
      'title',
    ]);
  });

  it('rejects explicit null fields that an omitted field would have defaulted', async () => {
    expect(await errorsOf(plainToInstance(CreateConversationDto, { projectId: null }))).toEqual([
      'projectId',
    ]);
    expect(await errorsOf(plainToInstance(CreateConversationDto, { title: null }))).toEqual([
      'title',
    ]);
  });

  it('keeps the shared pagination contract and an optional project filter', async () => {
    const dto = plainToInstance(ListConversationsQueryDto, { limit: '5' });
    expect(await errorsOf(dto)).toEqual([]);
    expect(dto.limit).toBe(5);
    expect(dto.projectId).toBeUndefined();

    expect(
      await errorsOf(plainToInstance(ListConversationsQueryDto, { projectId: 'not-a-uuid' })),
    ).toEqual(['projectId']);
  });
});
