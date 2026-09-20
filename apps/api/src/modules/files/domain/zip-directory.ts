/**
 * Reads a ZIP archive's central directory without inflating anything, so that an archive can be
 * judged before a parser touches it. Sizes come from the directory, which a hostile archive may
 * understate; they bound what an honest parser will allocate, and the extraction itself runs in
 * an isolated worker with its own memory and time limits.
 */
export interface ZipEntry {
  readonly name: string;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
}

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_FILE_HEADER = 0x02014b50;
const EOCD_MIN_SIZE = 22;
const MAX_COMMENT = 0xffff;
const ZIP64_MARKER = 0xffffffff;

export class ZipFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipFormatError';
  }
}

export function readZipDirectory(bytes: Buffer, maxEntries: number): readonly ZipEntry[] {
  const eocd = findEndOfCentralDirectory(bytes);
  const total = bytes.readUInt16LE(eocd + 10);
  const size = bytes.readUInt32LE(eocd + 12);
  const offset = bytes.readUInt32LE(eocd + 16);
  // ZIP64 is for archives beyond 4 GiB or 65,535 entries: never a legitimate office document here.
  if (total === 0xffff || size === ZIP64_MARKER || offset === ZIP64_MARKER) {
    throw new ZipFormatError('ZIP64 archives are not accepted');
  }
  if (total > maxEntries) throw new ZipFormatError('The archive holds too many entries');
  if (offset + size > eocd) throw new ZipFormatError('The central directory is out of bounds');

  const entries: ZipEntry[] = [];
  let cursor = offset;
  for (let index = 0; index < total; index += 1) {
    if (cursor + 46 > bytes.length || bytes.readUInt32LE(cursor) !== CENTRAL_FILE_HEADER) {
      throw new ZipFormatError('The central directory is malformed');
    }
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const nameEnd = cursor + 46 + nameLength;
    if (nameEnd > bytes.length) throw new ZipFormatError('An entry name is out of bounds');
    entries.push({
      name: bytes.toString('utf8', cursor + 46, nameEnd),
      compressedSize,
      uncompressedSize,
    });
    cursor = nameEnd + extraLength + commentLength;
  }
  return entries;
}

function findEndOfCentralDirectory(bytes: Buffer): number {
  const lowest = Math.max(0, bytes.length - EOCD_MIN_SIZE - MAX_COMMENT);
  for (let position = bytes.length - EOCD_MIN_SIZE; position >= lowest; position -= 1) {
    if (bytes.readUInt32LE(position) === END_OF_CENTRAL_DIRECTORY) return position;
  }
  throw new ZipFormatError('Not a ZIP archive');
}
