import { FILE_MAX_BYTES, FILE_NAME_MAX_LENGTH, FILE_SIGNATURE_BYTES } from '@alfred/contracts';
import { describe, expect, it } from 'vitest';

import {
  checkFileCandidate,
  FILE_INPUT_ACCEPT,
  fileExtension,
  kindFromName,
  readFileSignature,
  validateFile,
} from '@/lib/files/file-kinds';

const bytes = (...values: number[]) => new Uint8Array(values);
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31);
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04, 0x14, 0x00);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0);
const GIF = bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50);
const HTML = new TextEncoder().encode('<!doctype html><script>alert(1)</script>');

describe('file names and kinds', () => {
  it('reads the extension case-insensitively and maps it to a kind', () => {
    expect(fileExtension('Rapport.Final.PDF')).toBe('.pdf');
    expect(fileExtension('sans-extension')).toBe('');
    expect(kindFromName('contrat.docx')).toBe('docx');
    expect(kindFromName('photo.JPEG')).toBe('image');
    expect(kindFromName('notes.txt')).toBeNull();
  });

  it('offers the accepted extensions and media types to the file picker', () => {
    expect(FILE_INPUT_ACCEPT.split(',')).toEqual(
      expect.arrayContaining(['.pdf', '.docx', '.png', '.webp', 'application/pdf', 'image/gif']),
    );
  });
});

describe('early refusal of a file', () => {
  it.each([
    ['vide.pdf', 0, 'empty'],
    ['gros.pdf', FILE_MAX_BYTES + 1, 'too_large'],
    [`${'a'.repeat(FILE_NAME_MAX_LENGTH)}.pdf`, 10, 'name_too_long'],
    ['script.exe', 10, 'unsupported_extension'],
    ['sans-extension', 10, 'unsupported_extension'],
  ] as const)('refuses %s (%d bytes) as %s without reading a byte', (name, size, reason) => {
    expect(checkFileCandidate({ name, size })).toBe(reason);
  });

  it('accepts a file of exactly the maximum size, and honours a configured maximum', () => {
    expect(checkFileCandidate({ name: 'a.pdf', size: FILE_MAX_BYTES })).toBeNull();
    expect(checkFileCandidate({ name: 'a.pdf', size: 2_000 }, 1_000)).toBe('too_large');
  });

  it.each([
    ['a.pdf', PDF, 'pdf', 'application/pdf'],
    ['a.docx', ZIP, 'docx', expect.stringContaining('wordprocessingml') as unknown as string],
    ['a.png', PNG, 'image', 'image/png'],
    ['a.jpg', JPEG, 'image', 'image/jpeg'],
    ['a.gif', GIF, 'image', 'image/gif'],
    ['a.webp', WEBP, 'image', 'image/webp'],
  ])('recognises %s from its leading bytes', (name, signature, kind, mediaType) => {
    expect(validateFile({ name, size: 100 }, signature)).toEqual({ ok: true, kind, mediaType });
  });

  it('refuses an HTML page named .png, whatever its name says', () => {
    expect(validateFile({ name: 'photo.png', size: HTML.length }, HTML)).toEqual({
      ok: false,
      reason: 'unsupported_content',
    });
  });

  it('lets the bytes decide when the extension names another accepted image type', () => {
    expect(validateFile({ name: 'photo.png', size: 100 }, JPEG)).toEqual({
      ok: true,
      kind: 'image',
      mediaType: 'image/jpeg',
    });
  });

  it('checks size and extension before the bytes', () => {
    expect(validateFile({ name: 'notes.txt', size: 100 }, PDF)).toEqual({
      ok: false,
      reason: 'unsupported_extension',
    });
  });

  it('reads only the leading bytes of a file', async () => {
    const file = new File([new Uint8Array(4096).fill(7)], 'a.pdf');
    const signature = await readFileSignature(file);
    expect(signature).toHaveLength(FILE_SIGNATURE_BYTES);
    expect([...signature].every((value) => value === 7)).toBe(true);
  });
});
