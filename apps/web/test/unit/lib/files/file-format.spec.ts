import { FILE_MAX_TAGS, FILE_TAG_MAX_LENGTH } from '@alfred/contracts';
import { describe, expect, it } from 'vitest';

import {
  describeBulkDeletion,
  describeFileDeletion,
  describeFileFailure,
  describeFileUsage,
  formatFileSize,
  formatQuota,
  parseTags,
  quotaTakenBytes,
} from '@/lib/files/file-format';
import { latestFile } from '@/lib/files/latest-file';
import { storedFile } from '../../../support/files-api';

const MIB = 1024 * 1024;

describe('file sizes and quota', () => {
  it.each([
    [0, '0 octet'],
    [1, '1 octet'],
    [900, '900 octets'],
    [1024, '1 Kio'],
    [1536, '1,5 Kio'],
    [5 * MIB, '5 Mio'],
    [Math.round(12.4 * MIB), '12,4 Mio'],
    [MIB - 1, '1 Mio'],
  ])('formats %d bytes as « %s »', (bytes, text) => {
    expect(formatFileSize(bytes)).toBe(text);
  });

  it('counts reserved capacity as taken and never exceeds the limit', () => {
    const quota = {
      usedBytes: Math.round(12.4 * MIB),
      reservedBytes: 0,
      limitBytes: 25 * MIB,
      maxFileBytes: 5 * MIB,
    };
    expect(formatQuota(quota)).toBe('12,4 Mio sur 25 Mio');
    expect(quotaTakenBytes({ ...quota, usedBytes: 24 * MIB, reservedBytes: 3 * MIB })).toBe(
      25 * MIB,
    );
  });
});

describe('what a deletion says first', () => {
  it('describes where a file was sent, with singular and plural', () => {
    expect(describeFileUsage({ conversations: 0, messages: 0 })).toBeNull();
    expect(describeFileUsage({ conversations: 1, messages: 1 })).toBe(
      'joint à 1 message dans 1 conversation',
    );
    expect(describeFileUsage({ conversations: 2, messages: 3 })).toBe(
      'joint à 3 messages dans 2 conversations',
    );
  });

  it('warns that sent text stays in the conversations', () => {
    expect(describeFileDeletion(storedFile())).toBe(
      '« rapport.pdf » sera supprimé définitivement de vos fichiers.',
    );
    const sent = describeFileDeletion(storedFile({ usage: { conversations: 2, messages: 3 } }));
    expect(sent).toContain('joint à 3 messages dans 2 conversations');
    expect(sent).toContain('le texte déjà envoyé reste dans ces conversations');
  });

  it('sums a selection', () => {
    expect(describeBulkDeletion([storedFile(), storedFile()])).toBe(
      '2 fichiers seront supprimés définitivement.',
    );
    expect(
      describeBulkDeletion([
        storedFile({ usage: { conversations: 1, messages: 2 } }),
        storedFile({ usage: { conversations: 1, messages: 1 } }),
        storedFile(),
      ]),
    ).toBe(
      '3 fichiers seront supprimés définitivement. 2 fichiers sont joints à 3 messages : le texte déjà envoyé reste dans les conversations.',
    );
  });
});

describe('failures, tags and freshness', () => {
  it('explains each analysis failure, and an unknown one', () => {
    expect(describeFileFailure('no_readable_text')).toContain('Aucun texte lisible');
    expect(describeFileFailure('timeout')).toContain('trop de temps');
    expect(describeFileFailure(null)).toBe('L’analyse de ce fichier a échoué.');
  });

  it('parses tags: trimmed, unique whatever the case, bounded', () => {
    expect(parseTags(' contrat, 2026 ,, Contrat ,à relire')).toEqual([
      'contrat',
      '2026',
      'à relire',
    ]);
    expect(parseTags('x'.repeat(FILE_TAG_MAX_LENGTH + 10))[0]).toHaveLength(FILE_TAG_MAX_LENGTH);
    expect(parseTags(Array.from({ length: 40 }, (_, index) => `t${index}`).join(','))).toHaveLength(
      FILE_MAX_TAGS,
    );
  });

  it('keeps the answer the API wrote last', () => {
    const listed = storedFile({ readiness: 'processing' });
    const read = storedFile({ readiness: 'ready', updatedAt: '2026-09-18T10:00:00.000Z' });
    expect(latestFile(listed, read)).toBe(read);
    expect(latestFile(read, listed)).toBe(read);
    expect(latestFile(listed, undefined)).toBe(listed);
    expect(latestFile(listed, { ...read, id: 'another' })).toBe(listed);
  });
});
