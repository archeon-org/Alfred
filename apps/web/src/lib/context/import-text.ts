export function normalizeContextText(content: string): string {
  return content.replace(/\r\n?/gu, '\n');
}

export async function readContextFile(
  file: Pick<File, 'name' | 'size' | 'arrayBuffer'>,
  maxBytes: number,
): Promise<string> {
  if (!/\.(?:txt|md)$/iu.test(file.name)) {
    throw new Error('Choisissez un fichier texte (.txt) ou Markdown (.md).');
  }
  if (file.size > maxBytes) throw new Error('Ce fichier dépasse la limite autorisée.');
  let content: string;
  try {
    content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
  } catch {
    throw new Error('Impossible de lire ce fichier. Utilisez un texte encodé en UTF-8.');
  }
  if (content.includes('\0')) throw new Error('Le fichier contient un caractère nul interdit.');
  content = normalizeContextText(content);
  if (new TextEncoder().encode(content).byteLength > maxBytes) {
    throw new Error('Ce fichier dépasse la limite autorisée.');
  }
  return content;
}
