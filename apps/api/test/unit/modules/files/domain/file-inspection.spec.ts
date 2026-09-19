import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { FILE_MEDIA_TYPES } from '@alfred/contracts';
import { FileRejection, inspectUpload } from '@api/modules/files/domain/file-inspection';
import { docxWithText, pdfWithText, zipOf } from '../../../../support/file-fixtures';

const image = (format: 'png' | 'jpeg' | 'webp' | 'gif') =>
  sharp({ create: { width: 4, height: 4, channels: 3, background: '#336699' } })
    [format]()
    .toBuffer();

const rejectionOf = (bytes: Buffer): FileRejection => {
  try {
    inspectUpload(bytes);
  } catch (error) {
    if (error instanceof FileRejection) return error;
  }
  throw new Error('The upload was accepted');
};

describe('upload inspection', () => {
  it('recognizes a PDF and a Word document from their bytes', () => {
    expect(inspectUpload(pdfWithText('Bonjour'))).toEqual({
      kind: 'pdf',
      mediaType: FILE_MEDIA_TYPES.pdf,
      extension: '.pdf',
    });
    expect(inspectUpload(docxWithText('Bonjour'))).toEqual({
      kind: 'docx',
      mediaType: FILE_MEDIA_TYPES.docx,
      extension: '.docx',
    });
  });

  it.each([
    ['png', FILE_MEDIA_TYPES.png, '.png'],
    ['jpeg', FILE_MEDIA_TYPES.jpeg, '.jpg'],
    ['webp', FILE_MEDIA_TYPES.webp, '.webp'],
    ['gif', FILE_MEDIA_TYPES.gif, '.gif'],
  ] as const)('recognizes a %s image', async (format, mediaType, extension) => {
    expect(inspectUpload(await image(format))).toEqual({ kind: 'image', mediaType, extension });
  });

  it.each([
    ['an HTML page', Buffer.from('<!doctype html><script>alert(1)</script>')],
    ['an SVG image', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')],
    ['a PDF header that is not at the start', Buffer.from('<html>%PDF-1.7')],
    ['an executable', Buffer.from([0x4d, 0x5a, 0x90, 0x00])],
    ['plain text', Buffer.from('notes')],
  ])('refuses %s whatever its name says', (_label, bytes) => {
    expect(rejectionOf(bytes).code).toBe('unsupported_media_type');
  });

  it('refuses a ZIP archive that is not a Word document', () => {
    const spreadsheet = zipOf([
      { name: '[Content_Types].xml', content: '<Types/>' },
      { name: 'xl/workbook.xml', content: '<workbook/>' },
    ]);

    expect(rejectionOf(spreadsheet).code).toBe('unsupported_media_type');
  });

  it('refuses a macro-enabled document, which shares the DOCX container', () => {
    const macro = docxWithText('x', [{ name: 'word/vbaProject.bin', content: 'macro' }]);

    expect(rejectionOf(macro)).toMatchObject({ code: 'file_rejected' });
  });

  it('refuses a decompression bomb from its directory, before anything is inflated', () => {
    const bomb = docxWithText('x', [
      { name: 'word/media/bomb.bin', content: 'a', declaredSize: 900 * 1024 * 1024 },
    ]);
    const dense = docxWithText('x', [
      { name: 'word/media/dense.bin', content: Buffer.alloc(8 * 1024 * 1024) },
    ]);

    expect(rejectionOf(bomb).code).toBe('file_rejected');
    expect(rejectionOf(dense).code).toBe('file_rejected');
  });

  it('refuses an archive with an entry that would leave its directory', () => {
    const escaping = docxWithText('x', [{ name: '../../etc/cron.d/job', content: 'x' }]);

    expect(rejectionOf(escaping).code).toBe('file_rejected');
  });

  it('refuses a truncated or forged archive', () => {
    const valid = docxWithText('x');

    expect(rejectionOf(valid.subarray(0, valid.length - 30)).code).toBe('file_rejected');
  });
});
