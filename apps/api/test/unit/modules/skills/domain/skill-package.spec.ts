import { describe, expect, it } from 'vitest';
import { validateSkillPackage } from '../../../../../src/modules/skills/domain/skill-package';

const markdown = '---\nname: analyze-data\ndescription: Analyze a dataset\n---\n# Instructions\n';
const file = (path = 'SKILL.md', content = markdown) => ({
  path,
  contentBase64: Buffer.from(content).toString('base64'),
  mediaType: 'text/markdown',
});
const input = (files = [file()]) => ({
  name: 'analyze-data',
  description: 'Analyze a dataset',
  files,
});

describe('validateSkillPackage', () => {
  it('preserves exact binary bytes and original file paths', () => {
    const binary = {
      path: 'assets/model.bin',
      contentBase64: 'AP+A',
      mediaType: 'application/octet-stream',
    };
    expect(validateSkillPackage(input([file(), binary]))[1]).toEqual({
      path: binary.path,
      mediaType: binary.mediaType,
      content: Buffer.from([0, 255, 128]),
      sizeBytes: 3,
    });
  });
  it.each([
    '../SKILL.md',
    '/SKILL.md',
    'C:/SKILL.md',
    'scripts\\run.py',
    'scripts/../run.py',
    'scripts//run.py',
    'scripts/./run.py',
    'scripts/run.py\0',
  ])('rejects unsafe path %s', (path) => {
    expect(() => validateSkillPackage(input([file(), file(path)]))).toThrow();
  });
  it('rejects duplicate case-insensitive and Unicode-normalized paths', () => {
    expect(() => validateSkillPackage(input([file(), file('skill.md')]))).toThrow();
    expect(() =>
      validateSkillPackage(input([file(), file('assets/é'), file('assets/e\u0301')])),
    ).toThrow();
  });
  it('requires one canonical root SKILL.md', () => {
    expect(() => validateSkillPackage(input([file('references/SKILL.md')]))).toThrow();
  });
  it('rejects invalid and noncanonical base64', () => {
    for (const contentBase64 of ['!!!!', 'YWJj\n', 'YQ', 'YR==']) {
      expect(() => validateSkillPackage(input([{ ...file(), contentBase64 }]))).toThrow();
    }
  });
  it('requires valid UTF8 Markdown', () => {
    expect(() => validateSkillPackage(input([{ ...file(), contentBase64: '/w==' }]))).toThrow();
    expect(() => validateSkillPackage(input([file('SKILL.md', markdown + '\0')]))).toThrow();
  });
  it('allows custom relative paths, and rejects file/directory collisions', () => {
    expect(
      validateSkillPackage(input([file(), file('helper.py'), file('docs/examples/demo')])),
    ).toHaveLength(3);
    expect(() =>
      validateSkillPackage(input([file(), file('scripts/a'), file('scripts/a/b')])),
    ).toThrow();
  });
  it('checks package bytes, Markdown bytes and file count', () => {
    expect(() => validateSkillPackage(input(), { maxPackageBytes: 1 })).toThrow();
    expect(() => validateSkillPackage(input(), { maxSkillMarkdownBytes: 1 })).toThrow();
    expect(() => validateSkillPackage(input(), { maxFiles: 0 })).toThrow();
  });
  it.each([
    '# Missing frontmatter',
    '---\nname: wrong\ndescription: Analyze a dataset\n---\n',
    '---\nname: analyze-data\ndescription: !evil hi\n---\n',
    '---\nname: &name analyze-data\ndescription: *name\n---\n',
    '---\nname: analyze-data\nname: analyze-data\ndescription: Analyze a dataset\n---\n',
  ])('rejects missing, inconsistent and unsafe metadata', (content) => {
    expect(() => validateSkillPackage(input([file('SKILL.md', content)]))).toThrow();
  });
  it('accepts quoted and multiline YAML metadata', () => {
    const content =
      '---\nname: "analyze-data"\ndescription: >-\n  Analyze a dataset\n---\nRead this';
    expect(validateSkillPackage(input([file('SKILL.md', content)]))[0]?.content.toString()).toBe(
      content,
    );
  });
});
