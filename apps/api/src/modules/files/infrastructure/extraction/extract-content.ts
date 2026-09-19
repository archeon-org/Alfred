import type { ExtractionRequest, ExtractionResult } from '../../domain/extraction.port';

interface PdfTextItem {
  readonly str?: string;
  readonly hasEOL?: boolean;
}

interface PdfDocument {
  readonly numPages: number;
  getPage(pageNumber: number): Promise<{
    getTextContent(): Promise<{ readonly items: readonly PdfTextItem[] }>;
  }>;
  destroy(): Promise<void>;
}

/** Runs in the extraction worker (or inline in tests). Never throws: a failure is a result. */
export async function extractContent(request: ExtractionRequest): Promise<ExtractionResult> {
  try {
    if (request.kind === 'pdf') return await extractPdf(request);
    if (request.kind === 'docx') return await extractDocx(request);
    return await normalizeImage(request);
  } catch {
    // The parser's own message may quote document content; only the outcome leaves this function.
    return { status: 'failed', failureCode: 'parser_error' };
  }
}

async function extractPdf({ bytes, limits }: ExtractionRequest): Promise<ExtractionResult> {
  const { getDocumentProxy } = await import('unpdf');
  const pdf = (await getDocumentProxy(new Uint8Array(bytes), {
    // A document is data: no script evaluation, no XFA forms, no remote fetches.
    isEvalSupported: false,
    enableXfa: false,
    disableAutoFetch: true,
    disableStream: true,
    // Parser warnings may quote the document: nothing about its content reaches a log.
    verbosity: 0,
  })) as unknown as PdfDocument;

  try {
    const pages = Math.min(pdf.numPages, limits.maxPdfPages);
    const parts: string[] = [];
    let length = 0;
    let truncated = pdf.numPages > pages;

    for (let number = 1; number <= pages; number += 1) {
      const content = await (await pdf.getPage(number)).getTextContent();
      const text = content.items
        .map((item) => `${item.str ?? ''}${item.hasEOL === true ? '\n' : ''}`)
        .join('')
        .trim();
      if (text.length === 0) continue;
      const block = `[Page ${number}]\n${text}`;
      if (length + block.length > limits.maxChars) {
        parts.push(block.slice(0, limits.maxChars - length));
        truncated = true;
        break;
      }
      parts.push(block);
      length += block.length + 2;
    }

    const text = parts.join('\n\n');
    // A scanned document has pages but no text layer; reading it would need OCR.
    if (text.trim().length === 0) return { status: 'failed', failureCode: 'no_readable_text' };
    return { status: 'text', text, pageCount: pdf.numPages, truncated };
  } finally {
    await pdf.destroy();
  }
}

async function extractDocx({ bytes, limits }: ExtractionRequest): Promise<ExtractionResult> {
  const mammoth = await import('mammoth');
  const { value } = await mammoth.extractRawText({ buffer: bytes });
  const text = value.replace(/\n{3,}/gu, '\n\n').trim();
  if (text.length === 0) return { status: 'failed', failureCode: 'no_readable_text' };
  return {
    status: 'text',
    text: text.slice(0, limits.maxChars),
    pageCount: null,
    truncated: text.length > limits.maxChars,
  };
}

async function normalizeImage({ bytes, limits }: ExtractionRequest): Promise<ExtractionResult> {
  const { default: sharp } = await import('sharp');
  // libvips allocates outside the V8 heap, which a worker thread's `resourceLimits` do not see:
  // no operation cache and a single thread keep its native footprint to one image at a time.
  sharp.cache(false);
  sharp.concurrency(1);
  const derivative = await sharp(bytes, {
    // Refuses a decompression bomb, reads the first frame of an animation only.
    limitInputPixels: limits.imageMaxInputPixels,
    failOn: 'error',
    animated: false,
  })
    .rotate()
    .resize({
      width: limits.imageMaxEdgePx,
      height: limits.imageMaxEdgePx,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .flatten({ background: '#ffffff' })
    // Re-encoding drops EXIF, GPS and every other embedded metadata block.
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  return { status: 'image', derivative, mediaType: 'image/jpeg' };
}
