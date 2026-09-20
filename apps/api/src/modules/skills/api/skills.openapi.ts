import {
  skillEnvelopeSchema,
  skillListEnvelopeSchema,
  skillUpdateInputSchema,
  skillVersionInputSchema,
  skillWriteInputSchema,
} from '@alfred/contracts';
import { applyDecorators } from '@nestjs/common';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  ApiIdParam,
  ApiJsonBody,
  ApiNoContent,
  ApiRoute,
} from '../../../common/api-docs/api-docs.decorators';
import { PROBLEM } from '../../../common/api-docs/api-problems';
import {
  EXPECTED_VERSION_TEXT,
  FRONT_MATTER_QUOTING,
  SKILL_ACCOUNT_LOCK_NOTE,
  SKILL_BODY_TOO_LARGE,
  SKILL_DETAIL_DESCRIBE,
  SKILL_EXAMPLE,
  SKILL_EXPECTED_VERSION_INVALID,
  SKILL_FILE_COUNT_INVALID,
  SKILL_ID,
  SKILL_ID_TEXT,
  SKILL_LIST_DESCRIBE,
  SKILL_MD_DECODED,
  SKILL_NAME_CONFLICT,
  SKILL_PACKAGE,
  SKILL_PACKAGE_PROBLEMS,
  SKILL_PACKAGE_RENAMED,
  SKILL_PACKAGE_REVISED,
  SKILL_PRIVATE_PROBLEMS,
  SKILL_QUOTA_EXCEEDED,
  SKILL_ROW_LOCK_NOTE,
  SKILL_VERSION_CONFLICT,
  SKILL_WRITE_BLOCKED,
  SKILL_WRITE_DESCRIBE,
  SKILL_WRITE_FIELDS_INVALID,
} from './skills-shared.openapi';

/** `example`: the request example of the route whose `SKILL.md` is `SKILL_MD_DECODED`. */
const packageRules = (
  example: string,
) => `**Two layers of rules.** Field bounds are checked first and answer \`400 HTTP_400\`, one message per broken field: the \`name\` pattern, string lengths, and the number of files (none, or more than 50). The package rules below are checked next and answer \`400 skill_package_invalid\`: first broken rule only, message in French for the author.
- A root \`SKILL.md\` (exact case), at most 131 072 bytes, starting with a YAML front matter between two \`---\` lines whose \`name\` and \`description\`, **once parsed as YAML**, are strings strictly equal to the body fields; other front-matter keys are allowed. ${FRONT_MATTER_QUOTING}
- 1 to 50 files (the field rule above) and at most 1 048 576 decoded bytes in total. A deployment can lower the file count, the package size and the \`SKILL.md\` size; a package above a lowered limit answers \`skill_package_invalid\`. The values given here are the defaults and the most a deployment can allow. No route exposes the effective limits and the error carries no \`details\`: ask the operator when a package within these bounds is refused for its size or its file count.
- File bytes travel as canonical standard base64; \`.md\` files must be UTF-8 without NUL character; any other file can be binary, and an empty file is accepted.
- Scripts are stored, never executed by the API.

Decoded, the \`SKILL.md\` of the \`${example}\` request example reads:
\`\`\`
${SKILL_MD_DECODED}
\`\`\`

The JSON body itself is limited to 1 600 000 bytes (\`413\`).`;

export const DocListSkills = () =>
  applyDecorators(
    ApiRoute(
      'List the skills of the account for authoring',
      `Every skill the signed-in account owns, **drafts and disabled skills included**, each at its current snapshot. This is the authoring list; whoever *uses* skills reads \`GET /api/skills/published\` instead.

- Newest skill first (creation time, then identifier), stable across pages.
- Summaries only, no files: read \`GET /api/skills/{id}\` for the package.
- \`search\` narrows the list; keep the same \`search\` while following \`nextCursor\`.
- Skills are personal: those of another account never appear.`,
    ),
    ApiEnvelopeResponse({
      name: 'SkillsList',
      description: 'One page of skills.',
      contract: skillListEnvelopeSchema,
      describe: SKILL_LIST_DESCRIBE,
      data: { items: [SKILL_EXAMPLE.editedSummary, SKILL_EXAMPLE.otherSummary], nextCursor: null },
      more: {
        nextPage: {
          summary: 'More skills exist: send `nextCursor` back as `cursor`',
          data: {
            items: [SKILL_EXAMPLE.editedSummary],
            nextCursor:
              'eyJzb3J0VmFsdWUiOiIyMDI2LTA5LTE4VDA5OjEyOjMxLjIwNDAwMFoiLCJpZCI6IjE0NTZhNmMxLTllMjItNDQ5Ny04ZWZjLTc5OGZmODUxMWFjMiJ9',
          },
        },
        empty: {
          summary: 'No skill yet, or no match for `search`',
          data: { items: [], nextCursor: null },
        },
      },
    }),
    ApiErrors(
      PROBLEM.validation(
        '`limit` is not an integer from 1 to 100, `cursor` exceeds 512 characters, or `search` exceeds 160 characters, holds a NUL character or is repeated.',
        'search must be shorter than or equal to 160 characters',
      ),
      PROBLEM.unknownField,
      PROBLEM.invalidCursor,
      ...SKILL_PRIVATE_PROBLEMS,
    ),
  );

export const DocCreateSkill = () =>
  applyDecorators(
    ApiRoute(
      'Create a skill from a package',
      `Stores a new skill as snapshot \`1\`. The answer is the stored skill: \`version: 1\`, \`currentVersion: 1\`, \`publishedVersion: null\`, \`status: "draft"\`, \`enabled: true\`. Consumers do not see it until \`POST /api/skills/{id}/publish\`.

${packageRules('minimal')}

**Not idempotent.** After a network failure, look the name up with \`GET /api/skills?search=\` before retrying: a retry of a creation that succeeded answers \`409 skill_name_conflict\`. The account is never read from the body: the owner is the token's subject.

**Concurrency.** ${SKILL_ACCOUNT_LOCK_NOTE}: retry, after the same name look-up.`,
    ),
    ApiJsonBody({
      name: 'SkillsCreateBody',
      description:
        'The whole package. The front matter of `SKILL.md` repeats `name` and `description`, written as double-quoted YAML strings in every example.',
      contract: skillWriteInputSchema,
      describe: SKILL_WRITE_DESCRIBE,
      examples: {
        minimal: { summary: 'The smallest package: `SKILL.md` alone', value: SKILL_PACKAGE },
        withFiles: {
          summary: 'Instructions with a reference document and a script',
          value: SKILL_PACKAGE_REVISED,
        },
      },
    }),
    ApiEnvelopeResponse({
      name: 'SkillsCreated',
      status: 201,
      description: 'The skill as stored, files included.',
      contract: skillEnvelopeSchema,
      describe: SKILL_DETAIL_DESCRIBE,
      data: SKILL_EXAMPLE.created,
    }),
    ApiErrors(
      SKILL_WRITE_FIELDS_INVALID,
      SKILL_FILE_COUNT_INVALID,
      PROBLEM.unknownField,
      PROBLEM.invalidJson,
      ...SKILL_PACKAGE_PROBLEMS,
      ...SKILL_PRIVATE_PROBLEMS,
      SKILL_NAME_CONFLICT,
      SKILL_QUOTA_EXCEEDED,
      SKILL_BODY_TOO_LARGE,
      {
        ...SKILL_WRITE_BLOCKED,
        when: 'The creation waited more than 5 seconds behind another write of the same account and gave up: the transaction was rolled back and nothing was written. Any other unexpected failure answers the same body. Look the name up, then retry.',
      },
    ),
  );

export const DocGetSkill = () =>
  applyDecorators(
    ApiRoute(
      'Read a skill with the files of its current snapshot',
      `The skill as its author sees it: the current snapshot, which can be an unpublished draft, with every file. Consumers read \`GET /api/skills/published/{id}\` instead and get the published snapshot.

Keep the returned \`version\`: every write on this skill needs it as \`expectedVersion\`. Files are user-authored content and can be binary; the answer can reach about 1.4 MiB.`,
    ),
    ApiIdParam('id', SKILL_ID_TEXT, SKILL_ID),
    ApiEnvelopeResponse({
      name: 'SkillsDetail',
      description: 'The skill and the files of its current snapshot.',
      contract: skillEnvelopeSchema,
      describe: SKILL_DETAIL_DESCRIBE,
      data: SKILL_EXAMPLE.edited,
      more: {
        neverPublished: {
          summary: 'A new skill that was never published',
          data: SKILL_EXAMPLE.created,
        },
        published: {
          summary: 'The current snapshot is the published one',
          data: SKILL_EXAMPLE.published,
        },
        disabled: {
          summary: 'Published but switched off: hidden from consumers, still editable',
          data: SKILL_EXAMPLE.disabled,
        },
      },
    }),
    ApiErrors(...SKILL_PRIVATE_PROBLEMS, PROBLEM.notFound('skill')),
  );

export const DocUpdateSkill = () =>
  applyDecorators(
    ApiRoute(
      'Replace the package of a skill',
      `Replaces name, description and **all** files at once; there is no partial update and a file left out is removed. A rename is an update with another \`name\`.

- A real change stores a **new snapshot**: \`currentVersion\` becomes the highest retained number + 1, \`version\` increases by one, \`status\` becomes \`draft\`. \`publishedVersion\` does not move: consumers keep the published snapshot until \`POST /api/skills/{id}/publish\`.
- Sending exactly the stored name, description and files writes nothing and returns the skill unchanged, same \`version\`. \`expectedVersion\` is checked first all the same.
- After a network failure, re-read the skill before retrying: if the first attempt went through, the \`version\` moved and the same request answers \`409 skill_version_conflict\`.
- Older snapshots are kept (\`GET /api/skills/{id}/versions\`) and count toward the storage quota.
- ${SKILL_ACCOUNT_LOCK_NOTE}: re-read the skill, then retry.

${packageRules('unchanged')}`,
    ),
    ApiIdParam('id', SKILL_ID_TEXT, SKILL_ID),
    ApiJsonBody({
      name: 'SkillsUpdateBody',
      description: 'The whole new package and the `version` the skill was read at.',
      contract: skillUpdateInputSchema,
      describe: { ...SKILL_WRITE_DESCRIBE, expectedVersion: EXPECTED_VERSION_TEXT },
      examples: {
        edit: {
          summary: 'New description and two more files, read at version 2',
          value: { ...SKILL_PACKAGE_REVISED, expectedVersion: 2 },
        },
        rename: {
          summary: 'Rename: `name` changes in the body and in the front matter',
          value: { ...SKILL_PACKAGE_RENAMED, expectedVersion: 2 },
        },
        unchanged: {
          summary: 'Exactly what is stored: nothing is written, the answer keeps `version` 2',
          value: { ...SKILL_PACKAGE, expectedVersion: 2 },
        },
      },
    }),
    ApiEnvelopeResponse({
      name: 'SkillsUpdated',
      description: 'The skill as stored after the update, files included.',
      contract: skillEnvelopeSchema,
      describe: SKILL_DETAIL_DESCRIBE,
      data: SKILL_EXAMPLE.edited,
      more: {
        renamed: {
          summary:
            'After the `rename` request: the new name shows here, consumers keep `incident-runbook` until the next publication',
          data: SKILL_EXAMPLE.renamed,
        },
        unchanged: {
          summary: 'After the `unchanged` request: nothing written, same `version`',
          data: SKILL_EXAMPLE.published,
        },
      },
    }),
    ApiErrors(
      SKILL_WRITE_FIELDS_INVALID,
      SKILL_FILE_COUNT_INVALID,
      SKILL_EXPECTED_VERSION_INVALID,
      PROBLEM.unknownField,
      PROBLEM.invalidJson,
      ...SKILL_PACKAGE_PROBLEMS,
      ...SKILL_PRIVATE_PROBLEMS,
      PROBLEM.notFound('skill'),
      SKILL_VERSION_CONFLICT,
      SKILL_NAME_CONFLICT,
      SKILL_QUOTA_EXCEEDED,
      SKILL_BODY_TOO_LARGE,
      SKILL_WRITE_BLOCKED,
    ),
  );

export const DocDeleteSkill = () =>
  applyDecorators(
    ApiRoute(
      'Delete a skill with all its snapshots',
      `Removes the skill, **every retained snapshot and every file**, the published one included: consumers lose it immediately and its bytes stop counting toward the storage quota. It cannot be undone and there is no archive.

This \`DELETE\` takes a **JSON body** with the \`version\` last read, so a skill somebody just changed is not deleted by mistake. Send \`Content-Type: application/json\`; some HTTP clients drop the body of a \`DELETE\` unless asked not to. A second call answers \`404 skill_not_found\`.

${SKILL_ROW_LOCK_NOTE} If the re-read answers \`404 skill_not_found\`, the other write was a deletion.`,
    ),
    ApiIdParam('id', SKILL_ID_TEXT, SKILL_ID),
    ApiJsonBody({
      name: 'SkillsDeleteBody',
      description: 'The `version` the skill was read at.',
      contract: skillVersionInputSchema,
      describe: { expectedVersion: EXPECTED_VERSION_TEXT },
      examples: {
        remove: { summary: 'Delete the skill read at version 5', value: { expectedVersion: 5 } },
        neverChanged: {
          summary: 'Delete a skill that was created and never changed',
          value: { expectedVersion: 1 },
        },
      },
    }),
    ApiNoContent('The skill is deleted. The answer has no body.'),
    ApiErrors(
      SKILL_EXPECTED_VERSION_INVALID,
      PROBLEM.unknownField,
      PROBLEM.invalidJson,
      ...SKILL_PRIVATE_PROBLEMS,
      PROBLEM.notFound('skill'),
      SKILL_VERSION_CONFLICT,
      SKILL_BODY_TOO_LARGE,
      SKILL_WRITE_BLOCKED,
    ),
  );
