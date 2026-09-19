import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { extractContent } from '@api/modules/files/infrastructure/extraction/extract-content';
import { docxWithText, pdfWithoutText, pdfWithText } from '../../../../../support/file-fixtures';

const limits = {
  maxPdfPages: 50,
  maxChars: 10_000,
  imageMaxEdgePx: 1_568,
  imageMaxInputPixels: 50_000_000,
};

describe('content extraction', () => {
  it('reads the text layer of a PDF, page by page', async () => {
    const result = await extractContent({
      kind: 'pdf',
      bytes: pdfWithText('Clause 4 : resiliation'),
      limits,
    });

    expect(result).toEqual({
      status: 'text',
      text: '[Page 1]\nClause 4 : resiliation',
      pageCount: 1,
      truncated: false,
    });
  });

  it('says a scanned PDF has no readable text', async () => {
    await expect(extractContent({ kind: 'pdf', bytes: pdfWithoutText(), limits })).resolves.toEqual(
      { status: 'failed', failureCode: 'no_readable_text' },
    );
  });

  it('reads the paragraphs of a Word document', async () => {
    const result = await extractContent({
      kind: 'docx',
      bytes: docxWithText('Article premier\nArticle second'),
      limits,
    });

    expect(result).toMatchObject({ status: 'text', pageCount: null, truncated: false });
    expect(result.status === 'text' && result.text).toContain('Article premier');
    expect(result.status === 'text' && result.text).toContain('Article second');
  });

  it('stops at the character limit and reports it', async () => {
    const result = await extractContent({
      kind: 'docx',
      bytes: docxWithText('mot '.repeat(2_000)),
      limits: { ...limits, maxChars: 100 },
    });

    expect(result).toMatchObject({ status: 'text', truncated: true });
    expect(result.status === 'text' && result.text.length).toBe(100);
  });

  it('turns a parser failure into an outcome, never an exception or a message', async () => {
    await expect(
      extractContent({ kind: 'pdf', bytes: Buffer.from('%PDF-1.7 not a pdf'), limits }),
    ).resolves.toEqual({ status: 'failed', failureCode: 'parser_error' });
    await expect(
      extractContent({ kind: 'docx', bytes: Buffer.from('PK\u0003\u0004 broken'), limits }),
    ).resolves.toEqual({ status: 'failed', failureCode: 'parser_error' });
  });

  it('reduces an image, re-encodes it and drops its metadata', async () => {
    const original = await sharp({
      create: { width: 4_000, height: 2_000, channels: 3, background: '#aa3322' },
    })
      .withExif({ IFD0: { Copyright: 'secret-owner' } })
      .png()
      .toBuffer();

    const result = await extractContent({ kind: 'image', bytes: original, limits });

    expect(result.status).toBe('image');
    if (result.status !== 'image') return;
    const metadata = await sharp(result.derivative).metadata();
    expect(metadata).toMatchObject({ format: 'jpeg', width: 1_568, height: 784 });
    expect(metadata.exif).toBeUndefined();
    expect(result.derivative.includes(Buffer.from('secret-owner'))).toBe(false);
  });

  it('refuses an image beyond the pixel limit instead of decoding it', async () => {
    const huge = await sharp({
      create: { width: 3_000, height: 3_000, channels: 3, background: '#000' },
    })
      .png()
      .toBuffer();

    await expect(
      extractContent({
        kind: 'image',
        bytes: huge,
        limits: { ...limits, imageMaxInputPixels: 1_000_000 },
      }),
    ).resolves.toEqual({ status: 'failed', failureCode: 'parser_error' });
  });
});
