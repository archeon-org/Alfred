import { FILE_MEDIA_TYPES, sniffFileType, type FileKind } from '@alfred/contracts';

import { readZipDirectory, ZipFormatError } from './zip-directory';

export type FileRejectionCode = 'unsupported_media_type' | 'file_rejected';

/** Why an upload was refused; `reason` is a developer-facing note, never user content. */
export class FileRejection extends Error {
  constructor(
    readonly code: FileRejectionCode,
    readonly reason: string,
  ) {
    super(reason);
    this.name = 'FileRejection';
  }
}

export interface InspectedFile {
  readonly kind: FileKind;
  /** The type the bytes prove. The declared type and the file name are never trusted. */
  readonly mediaType: string;
  readonly extension: string;
}

/** ALF-DEC-054 "DOCX ZIP-expansion limits": bounds on what a parser would be asked to inflate. */
const DOCX_MAX_ENTRIES = 2_048;
const DOCX_MAX_INFLATED_BYTES = 100 * 1024 * 1024;
const DOCX_MAX_RATIO = 100;

const EXTENSIONS: Readonly<Record<string, string>> = Object.freeze({
  [FILE_MEDIA_TYPES.pdf]: '.pdf',
  [FILE_MEDIA_TYPES.docx]: '.docx',
  [FILE_MEDIA_TYPES.png]: '.png',
  [FILE_MEDIA_TYPES.jpeg]: '.jpg',
  [FILE_MEDIA_TYPES.webp]: '.webp',
  [FILE_MEDIA_TYPES.gif]: '.gif',
});

/**
 * Decides what an upload is from its bytes alone, and refuses what is outside the allow-list:
 * PDF, DOCX and PNG/JPEG/WebP/GIF. SVG is absent on purpose (it can carry script), as are
 * macro-enabled Office files, which share the DOCX container.
 */
export function inspectUpload(bytes: Buffer): InspectedFile {
  const sniffed = sniffFileType(bytes);
  if (sniffed === null) {
    throw new FileRejection('unsupported_media_type', 'The leading bytes match no accepted type');
  }
  if (sniffed.kind === 'docx') inspectDocx(bytes);
  return { ...sniffed, extension: EXTENSIONS[sniffed.mediaType] ?? '' };
}

function inspectDocx(bytes: Buffer): void {
  let entries;
  try {
    entries = readZipDirectory(bytes, DOCX_MAX_ENTRIES);
  } catch (error) {
    if (error instanceof ZipFormatError) throw new FileRejection('file_rejected', error.message);
    throw error;
  }

  const names = new Set(entries.map((entry) => entry.name));
  // A ZIP that is not a Word document (an XLSX, a JAR, a plain archive) is simply not accepted.
  if (!names.has('[Content_Types].xml') || !names.has('word/document.xml')) {
    throw new FileRejection('unsupported_media_type', 'The archive is not a Word document');
  }
  // A `.docm` has the same container; its macro project is what tells it apart.
  if ([...names].some((name) => /(^|\/)vbaProject\.bin$/iu.test(name))) {
    throw new FileRejection('file_rejected', 'Macro-enabled documents are not accepted');
  }
  if (entries.some((entry) => entry.name.startsWith('/') || entry.name.split('/').includes('..'))) {
    throw new FileRejection('file_rejected', 'The archive holds an unsafe entry name');
  }

  const inflated = entries.reduce((sum, entry) => sum + entry.uncompressedSize, 0);
  if (inflated > DOCX_MAX_INFLATED_BYTES) {
    throw new FileRejection('file_rejected', 'The archive inflates beyond the accepted size');
  }
  for (const entry of entries) {
    if (
      entry.compressedSize > 0 &&
      entry.uncompressedSize / entry.compressedSize > DOCX_MAX_RATIO
    ) {
      // Text compresses well, but never a hundredfold: that ratio is a decompression bomb.
      if (entry.uncompressedSize > 1024 * 1024) {
        throw new FileRejection('file_rejected', 'An archive entry has an abnormal ratio');
      }
    }
  }
}
