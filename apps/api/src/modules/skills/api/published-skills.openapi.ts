import { publishedSkillEnvelopeSchema, publishedSkillListEnvelopeSchema } from '@alfred/contracts';
import { applyDecorators } from '@nestjs/common';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  ApiIdParam,
  ApiRoute,
} from '../../../common/api-docs/api-docs.decorators';
import { PROBLEM } from '../../../common/api-docs/api-problems';

const SKILL_ID = '1456a6c1-9e22-4497-8efc-798ff8511ac2';

const SUMMARY_FIELDS = {
  id: 'Stable identity of the skill. It survives renames and new versions.',
  name: 'Published name, the one a consumer mounts the skill under. It can differ from the name the author sees while a rename is still an unpublished draft.',
  description: 'Published description, written for whoever decides when to use the skill.',
  publishedVersion:
    'Number of the published snapshot. A snapshot is immutable: `(id, publishedVersion)` always names the same content.',
  contentHash:
    'SHA-256 of the snapshot (each file path, media type and bytes, in path order). It changes whenever the content does, so it is a safe cache key.',
  totalBytes: 'Sum of the sizes of the snapshot files, in bytes.',
  publishedAt: 'When this snapshot was published (UTC).',
} as const;

const summary = {
  id: SKILL_ID,
  name: 'incident-runbook',
  description: 'How to triage a production incident before escalating.',
  publishedVersion: 3,
  contentHash: 'f991d70f296f86331593029e5eda0a64afa7ba60d7f98d09dffc0b8b009c4998',
  totalBytes: 1840,
  publishedAt: '2026-09-20T16:48:44.822Z',
};

export const DocListPublishedSkills = () =>
  applyDecorators(
    ApiRoute(
      'List the skills a consumer can use',
      `The account's skills that are **enabled and published**, each at its **published snapshot**.
This is the read side for whoever *uses* skills (an agent runtime); the authoring list is \`GET /api/skills\`.

- A draft the author is still editing never shows through, a rename included.
- A disabled or never-published skill is absent, exactly as if it did not exist.
- Newest skill first (creation time), stable across pages. No files here: fetch the detail only for the \`(id, publishedVersion)\` pairs you do not already hold.
- Names are unique among *current* skills, not among published snapshots: after an unpublished rename, two items can share a \`name\`. Choose deterministically (for example the latest \`publishedAt\`).`,
    ),
    ApiEnvelopeResponse({
      name: 'PublishedSkillList',
      description: 'One page of usable skills.',
      contract: publishedSkillListEnvelopeSchema,
      describe: Object.fromEntries(
        Object.entries(SUMMARY_FIELDS).map(([field, text]) => [`data.items[].${field}`, text]),
      ),
      data: { items: [summary], nextCursor: null },
      more: {
        empty: {
          summary: 'No usable skill (none published, all disabled, or no match for `name`)',
          data: { items: [], nextCursor: null },
        },
      },
    }),
    ApiErrors(
      PROBLEM.validation(
        '`limit` out of range, or `name` not a valid skill name.',
        'name must match /^[a-z0-9]+(?:-[a-z0-9]+)*$/u regular expression',
      ),
      PROBLEM.unknownField,
      PROBLEM.invalidCursor,
      PROBLEM.unauthenticated,
      PROBLEM.invalidToken,
      PROBLEM.featureDisabled('skills'),
    ),
  );

export const DocGetPublishedSkill = () =>
  applyDecorators(
    ApiRoute(
      'Read a usable skill with its files',
      `The published snapshot of one skill: the summary fields plus every file of the package.

- Files are the exact stored bytes in standard base64, binary files included. Decode to bytes; do not assume UTF-8.
- The package always holds a root \`SKILL.md\` whose YAML front matter carries the same \`name\` and \`description\`. At most 50 files and 1 MiB, so the answer can reach about 1.4 MiB.
- Files are user-authored content: scripts are stored, never executed by the API. Treat them as untrusted data.`,
    ),
    ApiIdParam(
      'id',
      'Identifier of the skill, as listed by `GET /api/skills/published`.',
      SKILL_ID,
    ),
    ApiEnvelopeResponse({
      name: 'PublishedSkillDetail',
      description: 'The published snapshot and its files.',
      contract: publishedSkillEnvelopeSchema,
      describe: {
        ...Object.fromEntries(
          Object.entries(SUMMARY_FIELDS).map(([field, text]) => [`data.${field}`, text]),
        ),
        'data.files': 'Every file of the snapshot, sorted by `path`.',
        'data.files[].path':
          'Path inside the package, `/`-separated, relative. Never absolute, never with a `.` or `..` segment, a backslash, a colon or a control character.',
        'data.files[].mediaType': 'Media type recorded when the file was authored.',
        'data.files[].contentBase64': 'The exact bytes of the file, standard base64 with padding.',
      },
      data: {
        ...summary,
        files: [
          {
            path: 'SKILL.md',
            mediaType: 'text/markdown',
            contentBase64:
              'LS0tCm5hbWU6IGluY2lkZW50LXJ1bmJvb2sKZGVzY3JpcHRpb246IEhvdyB0byB0cmlhZ2UgYSBwcm9kdWN0aW9uIGluY2lkZW50IGJlZm9yZSBlc2NhbGF0aW5nLgotLS0KQ2hlY2sgdGhlIHJ1bmJvb2sgZmlyc3Qu',
          },
        ],
      },
    }),
    ApiErrors(
      PROBLEM.unauthenticated,
      PROBLEM.invalidToken,
      {
        ...PROBLEM.notFound('skill'),
        when: 'The skill does not exist, belongs to another account, the identifier is not a UUID, **or the skill is disabled or was never published**. All indistinguishable by design.',
      },
      PROBLEM.featureDisabled('skills'),
    ),
  );
