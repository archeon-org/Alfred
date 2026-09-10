import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import {
  decodeSkillFile,
  encodeSkillFile,
  exportSkillPackage,
  importSkillPackage,
  normalizeSkillMarkdown,
} from '@/lib/skills/skill-package';

const markdown = '---\nname: analyze-data\ndescription: Analyze a dataset\n---\n# Instructions\n';
const upload = (data: Uint8Array | string, name: string) =>
  new File([typeof data === 'string' ? data : new Uint8Array(data).buffer], name);
const readBlob = (blob: Blob) =>
  new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('Lecture impossible.'));
    reader.readAsArrayBuffer(blob);
  });

describe('skill packages', () => {
  it('imports plain Markdown for metadata completion', async () => {
    const skill = await importSkillPackage(upload('# Bonjour é', 'instructions.md'));
    expect(skill.name).toBe('');
    expect(decodeSkillFile(skill.files[0]!)).toBe('# Bonjour é');
    expect(normalizeSkillMarkdown('# Bonjour é', 'analyze-data', 'Analyze a dataset')).toContain(
      'name: analyze-data',
    );
  });
  it('imports metadata and preserves Markdown exactly', async () => {
    const skill = await importSkillPackage(upload(markdown, 'SKILL.md'));
    expect(skill.name).toBe('analyze-data');
    expect(skill.description).toBe('Analyze a dataset');
    expect(decodeSkillFile(skill.files[0]!)).toBe(markdown);
  });
  it('preserves existing frontmatter bytes when metadata has not changed', () => {
    const original =
      '---\r\nname: "analyze-data"\r\ndescription: Analyze a dataset\r\nlicense: MIT\r\n---\r\n# Instructions\r\n';
    expect(normalizeSkillMarkdown(original, 'analyze-data', 'Analyze a dataset')).toBe(original);
    const modified = normalizeSkillMarkdown(original, 'new-name', 'New description');
    expect(modified).toContain('license: MIT');
    expect(modified).toContain('New description');
    expect(modified).toContain('# Instructions\r\n');
  });
  it('preserves arbitrary binary files through ZIP import and export', async () => {
    const zip = zipSync({
      'SKILL.md': strToU8(markdown),
      'assets/data.bin': new Uint8Array([0, 255, 128]),
    });
    const skill = await importSkillPackage(upload(zip, 'skill.zip'));
    expect(skill.files.find((file) => file.path === 'assets/data.bin')?.contentBase64).toBe('AP+A');
    const exported = await exportSkillPackage(skill);
    const reimported = await importSkillPackage(
      upload(new Uint8Array(await readBlob(exported)), 'again.zip'),
    );
    expect(reimported.files).toEqual(skill.files);
  });
  it('exports a single Markdown file as UTF-8', async () => {
    const exported = await exportSkillPackage({
      name: 'analyze-data',
      description: 'Analyze a dataset',
      files: [encodeSkillFile('SKILL.md', markdown)],
    });
    expect(new TextDecoder().decode(await readBlob(exported))).toBe(markdown);
  });
  it('exports filenames resembling JavaScript object properties without interpreting them', async () => {
    const skill = {
      name: 'analyze-data',
      description: 'Analyze a dataset',
      files: [
        encodeSkillFile('SKILL.md', markdown),
        encodeSkillFile('__proto__', 'safe'),
        encodeSkillFile('constructor', 'also safe'),
      ],
    };
    const exported = await exportSkillPackage(skill);
    const reimported = await importSkillPackage(
      upload(new Uint8Array(await readBlob(exported)), 'again.zip'),
    );
    expect(reimported.files).toEqual(skill.files);
  });
  it.each(['../evil.py', 'scripts/../evil.py', 'scripts\\evil.py', '/evil.py', 'skill.md'])(
    'rejects unsafe or duplicate ZIP path %s',
    async (path) => {
      const zip = zipSync({ 'SKILL.md': strToU8(markdown), [path]: strToU8('evil') });
      await expect(importSkillPackage(upload(zip, 'bad.zip'))).rejects.toThrow();
    },
  );
  it('rejects packages without root instructions', async () => {
    await expect(
      importSkillPackage(upload(zipSync({ 'references/SKILL.md': strToU8(markdown) }), 'bad.zip')),
    ).rejects.toThrow();
  });
  it('allows custom relative paths but rejects file/directory collisions', async () => {
    const accepted = zipSync({
      'SKILL.md': strToU8(markdown),
      'helper.py': strToU8('print(1)'),
      'docs/examples/demo': new Uint8Array(),
    });
    expect((await importSkillPackage(upload(accepted, 'ok.zip'))).files).toHaveLength(3);
    const collision = zipSync({
      'SKILL.md': strToU8(markdown),
      'scripts/a': strToU8('x'),
      'scripts/a/b': strToU8('x'),
    });
    await expect(importSkillPackage(upload(collision, 'bad.zip'))).rejects.toThrow();
    await expect(importSkillPackage(upload(markdown + '\0', 'bad.md'))).rejects.toThrow();
  });
  it('rejects unsupported file formats and malformed UTF8', async () => {
    await expect(importSkillPackage(upload('hello', 'x.pdf'))).rejects.toThrow();
    await expect(importSkillPackage(upload(new Uint8Array([255]), 'x.md'))).rejects.toThrow();
  });
  it('rejects symlinks identified in the central directory', async () => {
    const zip = zipSync({ 'SKILL.md': strToU8(markdown) });
    const view = new DataView(zip.buffer);
    for (let i = 0; i < zip.length - 46; i++)
      if (view.getUint32(i, true) === 0x02014b50) {
        view.setUint16(i + 4, 0x0314, true);
        view.setUint32(i + 38, 0xa1ff0000, true);
      }
    await expect(importSkillPackage(upload(zip, 'link.zip'))).rejects.toThrow();
  });
  it('bounds decompression even when compressed metadata lies about expanded bytes', async () => {
    const zip = zipSync({
      'SKILL.md': strToU8(markdown),
      'assets/bomb': new Uint8Array(8 * 1024 * 1024),
    });
    const view = new DataView(zip.buffer);
    for (let i = 0; i < zip.length - 46; i++) {
      if (
        view.getUint32(i, true) === 0x02014b50 &&
        view.getUint32(i + 24, true) === 8 * 1024 * 1024
      )
        view.setUint32(i + 24, 1024, true);
      if (
        view.getUint32(i, true) === 0x04034b50 &&
        view.getUint32(i + 22, true) === 8 * 1024 * 1024
      )
        view.setUint32(i + 22, 1024, true);
    }
    await expect(importSkillPackage(upload(zip, 'bomb.zip'))).rejects.toThrow('Le ZIP dépasse');
  });
  it('rejects corrupted CRC and encrypted archives', async () => {
    for (const encrypted of [false, true]) {
      const zip = zipSync({ 'SKILL.md': strToU8(markdown) });
      const view = new DataView(zip.buffer);
      for (let i = 0; i < zip.length - 46; i++) {
        const header = view.getUint32(i, true);
        if (header === 0x02014b50) {
          if (encrypted) view.setUint16(i + 8, 1, true);
          else view.setUint32(i + 16, 0, true);
        }
        if (header === 0x04034b50) {
          if (encrypted) view.setUint16(i + 6, 1, true);
          else view.setUint32(i + 14, 0, true);
        }
      }
      await expect(importSkillPackage(upload(zip, 'bad.zip'))).rejects.toThrow();
    }
  });
  it('rejects local and central filenames that disagree', async () => {
    const zip = zipSync({ 'SKILL.md': strToU8(markdown) });
    zip[30] = 88;
    await expect(importSkillPackage(upload(zip, 'bad.zip'))).rejects.toThrow();
  });
  it('ignores ordinary directory entries and rejects directories colliding with files', async () => {
    const zip = zipSync({
      'SKILL.md': strToU8(markdown),
      'scripts/': new Uint8Array(),
      'scripts/run.py': strToU8('print(1)'),
    });
    expect((await importSkillPackage(upload(zip, 'ok.zip'))).files).toHaveLength(2);
    const bad = zipSync({
      'SKILL.md': strToU8(markdown),
      'scripts/': new Uint8Array(),
      scripts: strToU8('file'),
    });
    await expect(importSkillPackage(upload(bad, 'bad.zip'))).rejects.toThrow();
  });
  it('rejects unsafe YAML aliases and tags', async () => {
    for (const header of [
      'name: &n analyze-data\ndescription: *n',
      'name: analyze-data\ndescription: !evil test',
    ]) {
      await expect(importSkillPackage(upload(`---\n${header}\n---\n`, 'x.md'))).rejects.toThrow();
    }
  });
});
