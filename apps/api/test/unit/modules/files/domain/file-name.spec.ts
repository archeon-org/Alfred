import { describe, expect, it } from 'vitest';

import {
  nameKey,
  normalizeFileRename,
  normalizeFolderName,
  sanitizeFileName,
  suffixedName,
} from '@api/modules/files/domain/file-name';

describe('file names', () => {
  it('keeps the base name and takes the extension from the detected type', () => {
    expect(sanitizeFileName('Rapport annuel.PDF', '.pdf')).toBe('Rapport annuel.pdf');
    expect(sanitizeFileName('photo.png', '.jpg')).toBe('photo.jpg');
    expect(sanitizeFileName('sans-extension', '.docx')).toBe('sans-extension.docx');
  });

  it('drops the directories a browser may send with the name', () => {
    expect(sanitizeFileName('C:\\Users\\moi\\Bureau\\contrat.docx', '.docx')).toBe('contrat.docx');
    expect(sanitizeFileName('../../etc/passwd', '.pdf')).toBe('passwd.pdf');
  });

  it('removes what would make a name display as something else', () => {
    const disguised = `facture\u202Efdp.exe`;

    expect(sanitizeFileName(disguised, '.pdf')).toBe('facturefdp.pdf');
    expect(sanitizeFileName('a\u0000b\u200Bc.pdf', '.pdf')).toBe('abc.pdf');
  });

  it('falls back to a neutral name when nothing usable is left', () => {
    expect(sanitizeFileName('.pdf', '.pdf')).toBe('fichier.pdf');
    expect(sanitizeFileName('   ', '.png')).toBe('fichier.png');
  });

  it('bounds the length while keeping the extension', () => {
    const name = sanitizeFileName(`${'a'.repeat(400)}.pdf`, '.pdf');

    expect(name).toHaveLength(255);
    expect(name.endsWith('.pdf')).toBe(true);
  });

  it('suffixes a repeated name before its extension', () => {
    expect(suffixedName('scan.pdf', 1)).toBe('scan.pdf');
    expect(suffixedName('scan.pdf', 2)).toBe('scan (2).pdf');
    expect(suffixedName('sans-extension', 3)).toBe('sans-extension (3)');
  });

  it('compares names without case or composition differences', () => {
    expect(nameKey('Résumé.PDF')).toBe(nameKey('re\u0301sume\u0301.pdf'));
  });

  it('refuses a rename or a folder name that is empty or a path segment', () => {
    expect(normalizeFileRename('  ', '.pdf')).toBeNull();
    expect(normalizeFileRename('..', '.pdf')).toBeNull();
    expect(normalizeFileRename('nouveau nom', '.pdf')).toBe('nouveau nom.pdf');
    expect(normalizeFolderName(' . ')).toBeNull();
    expect(normalizeFolderName('Contrats/2026')).toBe('Contrats-2026');
  });
});
