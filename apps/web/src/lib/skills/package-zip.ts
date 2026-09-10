import { SKILL_MAX_FILES, SKILL_MAX_PACKAGE_BYTES } from '@alfred/contracts';
import { Inflate } from 'fflate';
import { assertPackagePath, decodeUtf8, packageError } from './package-content';

interface ZipEntry {
  path: string;
  method: number;
  crc: number;
  compressedSize: number;
  size: number;
  dataOffset: number;
}

const signature = (view: DataView, offset: number, value: number) =>
  offset >= 0 && offset + 4 <= view.byteLength && view.getUint32(offset, true) === value;
const invalidZip = (): never => packageError('Archive ZIP invalide ou non prise en charge.');

function endOfDirectory(view: DataView): number {
  for (
    let offset = view.byteLength - 22;
    offset >= Math.max(0, view.byteLength - 65_557);
    offset--
  ) {
    if (
      signature(view, offset, 0x06054b50) &&
      offset + 22 + view.getUint16(offset + 20, true) === view.byteLength
    )
      return offset;
  }
  return invalidZip();
}

// Read only Zip32 metadata. fflate owns DEFLATE decoding; this preflight rejects
// links/encryption/multipart archives before any compressed bytes are expanded.
function readDirectory(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = endOfDirectory(view);
  const count = view.getUint16(end + 10, true);
  const start = view.getUint32(end + 16, true);
  if (
    view.getUint16(end + 4, true) ||
    view.getUint16(end + 6, true) ||
    view.getUint16(end + 8, true) !== count ||
    count > SKILL_MAX_FILES * 2 ||
    start + view.getUint32(end + 12, true) !== end
  )
    invalidZip();
  const entries: ZipEntry[] = [];
  const paths = new Set<string>();
  let cursor = start;
  let total = 0;
  for (let index = 0; index < count; index++) {
    if (!signature(view, cursor, 0x02014b50) || cursor + 46 > end) invalidZip();
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const next =
      cursor +
      46 +
      nameLength +
      view.getUint16(cursor + 30, true) +
      view.getUint16(cursor + 32, true);
    const mode = view.getUint32(cursor + 38, true) >>> 16;
    if (
      next > end ||
      (flags & ~0x080e) !== 0 ||
      ![0, 8].includes(method) ||
      view.getUint16(cursor + 34, true) ||
      ((mode & 0xf000) !== 0 && ![0x8000, 0x4000].includes(mode & 0xf000))
    )
      invalidZip();
    const path = decodeUtf8(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    const normalized = path.normalize('NFC').toLowerCase().replace(/\/$/u, '');
    if (paths.has(normalized)) packageError('Le ZIP contient des chemins dupliqués.');
    paths.add(normalized);
    const directory = path.endsWith('/');
    assertPackagePath(directory ? `${path}__directory__` : path);
    const size = view.getUint32(cursor + 24, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    total += size;
    if (
      total > SKILL_MAX_PACKAGE_BYTES ||
      compressedSize === 0xffffffff ||
      (directory && size !== 0)
    )
      packageError('Le ZIP dépasse la taille décompressée autorisée.');
    const local = view.getUint32(cursor + 42, true);
    if (
      !signature(view, local, 0x04034b50) ||
      local + 30 > start ||
      view.getUint16(local + 6, true) !== flags ||
      view.getUint16(local + 8, true) !== method
    )
      invalidZip();
    const localNameLength = view.getUint16(local + 26, true);
    const dataOffset = local + 30 + localNameLength + view.getUint16(local + 28, true);
    if (
      dataOffset + compressedSize > start ||
      decodeUtf8(bytes.subarray(local + 30, local + 30 + localNameLength)) !== path
    )
      invalidZip();
    if (
      !(flags & 8) &&
      (view.getUint32(local + 14, true) !== view.getUint32(cursor + 16, true) ||
        view.getUint32(local + 18, true) !== compressedSize ||
        view.getUint32(local + 22, true) !== size)
    )
      invalidZip();
    if (!directory)
      entries.push({
        path,
        method,
        crc: view.getUint32(cursor + 16, true),
        compressedSize,
        size,
        dataOffset,
      });
    cursor = next;
  }
  if (cursor !== end || !entries.length || entries.length > SKILL_MAX_FILES) invalidZip();
  return entries;
}

function crc32(bytes: Uint8Array): number {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}

function inflateEntry(bytes: Uint8Array, entry: ZipEntry, remainingBytes: number): Uint8Array {
  const compressed = bytes.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize);
  let content: Uint8Array;
  if (entry.method === 0) content = compressed.slice();
  else {
    const chunks: Uint8Array[] = [];
    let size = 0;
    const inflate = new Inflate((chunk) => {
      size += chunk.byteLength;
      if (size > remainingBytes || size > entry.size)
        packageError('Le ZIP dépasse la taille décompressée autorisée.');
      chunks.push(chunk);
    });
    // Small compressed chunks bound each inflate allocation even for forged
    // declared sizes. Abort before retaining bytes beyond the package budget.
    for (let offset = 0; offset < compressed.length; offset += 256)
      inflate.push(compressed.subarray(offset, offset + 256), offset + 256 >= compressed.length);
    content = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      content.set(chunk, offset);
      offset += chunk.length;
    }
  }
  if (
    content.length !== entry.size ||
    content.length > remainingBytes ||
    crc32(content) !== entry.crc
  )
    invalidZip();
  return content;
}

export function readSkillZip(bytes: Uint8Array): { path: string; content: Uint8Array }[] {
  try {
    const entries = readDirectory(bytes);
    let remaining = SKILL_MAX_PACKAGE_BYTES;
    return entries.map((entry) => {
      const content = inflateEntry(bytes, entry, remaining);
      remaining -= content.length;
      return { path: entry.path, content };
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.startsWith('Le ZIP') || error.message.startsWith('Chemin'))
    )
      throw error;
    return invalidZip();
  }
}
