import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { OwnedResourceNotFoundException } from '@api/common/ownership/owned-resource-not-found.exception';
import { ResourceIdPipe } from '@api/common/validation/resource-id.pipe';
import {
  MaxByteLength,
  normalizedText,
  trimmedString,
  utf8ByteLength,
} from '@api/common/validation/text-input';

class Note {
  @MaxByteLength(4)
  body!: string;
}

describe('ResourceIdPipe', () => {
  it('normalizes a valid identifier', () => {
    expect(new ResourceIdPipe('project').transform('0B6E1A9E-0A7F-4C26-9F5B-2F1A2C3D4E5F')).toBe(
      '0b6e1a9e-0a7f-4c26-9f5b-2f1a2c3d4e5f',
    );
  });

  it.each(['not-a-uuid', '', 42, undefined, '0b6e1a9e-0a7f-0c26-9f5b-2f1a2c3d4e5f'])(
    'answers a malformed identifier %j with the resource 404',
    (value) => {
      const pipe = new ResourceIdPipe('conversation');
      expect(() => pipe.transform(value)).toThrow(OwnedResourceNotFoundException);
      expect(() => pipe.transform(value)).toThrow(
        expect.objectContaining({ code: 'conversation_not_found' }),
      );
    },
  );
});

describe('text input helpers', () => {
  it('trims and normalizes only string values', () => {
    expect(trimmedString('  a ')).toBe('a');
    expect(trimmedString(1)).toBe(1);
    expect(normalizedText('a\r\nb\r\n')).toBe('a\nb\n');
    expect(normalizedText(null)).toBeNull();
  });

  it('measures UTF-8 bytes rather than code units', async () => {
    expect(utf8ByteLength('é')).toBe(2);
    expect(await validate(plainToInstance(Note, { body: 'éé' }))).toEqual([]);
    const [error] = await validate(plainToInstance(Note, { body: 'ééé' }));
    expect(error?.constraints).toEqual({ maxByteLength: 'body must not exceed 4 bytes' });
    expect(await validate(plainToInstance(Note, { body: 12 }))).toHaveLength(1);
  });
});
