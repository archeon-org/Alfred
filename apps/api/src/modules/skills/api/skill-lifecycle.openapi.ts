import {
  skillAvailabilityInputSchema,
  skillEnvelopeSchema,
  skillRestoreInputSchema,
  skillVersionInputSchema,
  skillVersionListEnvelopeSchema,
} from '@alfred/contracts';
import { applyDecorators } from '@nestjs/common';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  ApiIdParam,
  ApiJsonBody,
  ApiRoute,
} from '../../../common/api-docs/api-docs.decorators';
import { PROBLEM } from '../../../common/api-docs/api-problems';
import {
  EXPECTED_VERSION_TEXT,
  SKILL_BODY_TOO_LARGE,
  SKILL_DETAIL_DESCRIBE,
  SKILL_EXAMPLE,
  SKILL_EXPECTED_VERSION_INVALID,
  SKILL_ID,
  SKILL_ID_TEXT,
  SKILL_NAME_CONFLICT,
  SKILL_PRIVATE_PROBLEMS,
  SKILL_VERSION_CONFLICT,
} from './skills-shared.openapi';

const snapshot = (
  version: number,
  source: { readonly name: string; readonly description: string; readonly totalBytes: number },
  createdAt: string,
  publishedAt: string | null,
) => ({
  version,
  name: source.name,
  description: source.description,
  totalBytes: source.totalBytes,
  createdAt,
  publishedAt,
});
const FIRST_SNAPSHOT = snapshot(
  1,
  SKILL_EXAMPLE.created,
  SKILL_EXAMPLE.created.createdAt,
  SKILL_EXAMPLE.published.updatedAt,
);
const SECOND_SNAPSHOT = snapshot(
  2,
  SKILL_EXAMPLE.edited,
  SKILL_EXAMPLE.edited.updatedAt,
  SKILL_EXAMPLE.republished.updatedAt,
);
const DRAFT_SNAPSHOT = snapshot(2, SKILL_EXAMPLE.edited, SKILL_EXAMPLE.edited.updatedAt, null);

export const DocListSkillVersions = () =>
  applyDecorators(
    ApiRoute(
      'List the retained snapshots of a skill',
      `The history of a skill: one item per snapshot, **highest number first**. The creation stores snapshot \`1\`, every real edit stores a new one; restoring, publishing and switching availability store none. The content of a snapshot never changes, and snapshots are kept until the skill is deleted.

- This list pages by number, not by cursor: send the \`nextBefore\` of a page as \`before\` to get the next one; \`nextBefore: null\` is the last page.
- Items carry no files and there is no route that reads the files of an older snapshot: restore it (\`POST /api/skills/{id}/restore\`) to see and edit its content.
- To know which snapshot is current or published, compare \`version\` with \`currentVersion\` and \`publishedVersion\` of \`GET /api/skills/{id}\`.`,
    ),
    ApiIdParam('id', SKILL_ID_TEXT, SKILL_ID),
    ApiEnvelopeResponse({
      name: 'SkillsVersionList',
      description: 'One page of snapshots, highest number first.',
      contract: skillVersionListEnvelopeSchema,
      describe: {
        'data.nextBefore':
          'The `before` of the next page: the lowest snapshot number of this page. `null` on the last page.',
        'data.items[].version':
          'Number of the snapshot; send it as `sourceVersion` to restore it. Numbers only grow and are never reused, so after a restore the highest number is not necessarily the current one.',
        'data.items[].name': 'Name the skill had in this snapshot.',
        'data.items[].description': 'Description the skill had in this snapshot.',
        'data.items[].totalBytes':
          'Sum of the decoded sizes of the snapshot files, in bytes. It counts toward the storage quota as long as the skill exists.',
        'data.items[].createdAt':
          'When the snapshot was stored (UTC): the creation of the skill, or the edit that produced it.',
        'data.items[].publishedAt':
          'Last time this snapshot was published (UTC); `null` when it never was. Publishing it again after a restore moves the date. A date does not mean it is the snapshot published now: compare `version` with `publishedVersion` of the skill.',
      },
      data: { items: [SECOND_SNAPSHOT, FIRST_SNAPSHOT], nextBefore: null },
      more: {
        nextPage: {
          summary: 'With `limit=1`: an unpublished edit, and an older snapshot behind `before=2`',
          data: { items: [DRAFT_SNAPSHOT], nextBefore: 2 },
        },
        beyondFirst: {
          summary: '`before=1`: no snapshot has a lower number',
          data: { items: [], nextBefore: null },
        },
      },
    }),
    ApiErrors(
      PROBLEM.validation(
        '`before` is not an integer from 1 to 2 147 483 647 (an empty value included), or `limit` is not an integer from 1 to 100.',
        'before must not be less than 1',
      ),
      { ...PROBLEM.unknownField, message: ['property cursor should not exist'] },
      ...SKILL_PRIVATE_PROBLEMS,
      PROBLEM.notFound('skill'),
    ),
  );

export const DocRestoreSkillVersion = () =>
  applyDecorators(
    ApiRoute(
      'Make a retained snapshot the current one again',
      `Rolls the skill back (or forward) to the snapshot \`sourceVersion\`: name, description and files become those of that snapshot.

- Nothing is copied: \`currentVersion\` becomes \`sourceVersion\` and \`version\` increases by one. No snapshot is created or removed, and the storage quota is not checked.
- \`publishedVersion\` does not move, so the result is a \`draft\` unless \`sourceVersion\` is the published snapshot. Call \`POST /api/skills/{id}/publish\` to give the restored content to consumers.
- The next edit is numbered after the highest retained snapshot, not after \`sourceVersion\`.
- Restoring the snapshot that is already current writes nothing and returns the skill unchanged, same \`version\`. \`expectedVersion\` is checked first all the same.
- The snapshot brings its name back: if another skill took that name meanwhile, the answer is \`409 skill_name_conflict\` and nothing changes.`,
    ),
    ApiIdParam('id', SKILL_ID_TEXT, SKILL_ID),
    ApiJsonBody({
      name: 'SkillsRestoreBody',
      description: 'The snapshot to go back to and the `version` the skill was read at.',
      contract: skillRestoreInputSchema,
      describe: {
        expectedVersion: EXPECTED_VERSION_TEXT,
        sourceVersion:
          'Number of a retained snapshot of this skill, as listed by `GET /api/skills/{id}/versions`. 1 to 2 147 483 647.',
      },
      examples: {
        rollback: {
          summary: 'Go back to snapshot 1 while snapshot 2 stays published',
          value: { expectedVersion: 4, sourceVersion: 1 },
        },
        discardDraft: {
          summary: 'Drop an unpublished edit by restoring the published snapshot',
          value: { expectedVersion: 3, sourceVersion: 1 },
        },
      },
    }),
    ApiEnvelopeResponse({
      name: 'SkillsRestored',
      description: 'The skill after the restore, with the files of the restored snapshot.',
      contract: skillEnvelopeSchema,
      describe: SKILL_DETAIL_DESCRIBE,
      data: SKILL_EXAMPLE.restored,
      more: {
        backToPublished: {
          summary: 'The restored snapshot is the published one: `status` is `published` again',
          data: SKILL_EXAMPLE.restoredToPublished,
        },
      },
    }),
    ApiErrors(
      PROBLEM.validation(
        '`sourceVersion` is missing, not a JSON integer, or outside 1 to 2 147 483 647.',
        'sourceVersion must not be less than 1',
      ),
      SKILL_EXPECTED_VERSION_INVALID,
      PROBLEM.unknownField,
      PROBLEM.invalidJson,
      ...SKILL_PRIVATE_PROBLEMS,
      {
        ...PROBLEM.notFound('skill'),
        when: 'The skill does not exist, belongs to another account, the identifier is not a UUID, **or the skill has no snapshot numbered `sourceVersion`**. The same answer for all, by design.',
      },
      SKILL_VERSION_CONFLICT,
      SKILL_NAME_CONFLICT,
      SKILL_BODY_TOO_LARGE,
    ),
  );

export const DocSetSkillAvailability = () =>
  applyDecorators(
    ApiRoute(
      'Switch a skill on or off for consumers',
      `Sets \`enabled\` without touching the content, the snapshots or the publication.

- \`enabled: false\` removes the skill from \`GET /api/skills/published\` and makes \`GET /api/skills/published/{id}\` answer \`404\`. Authoring routes keep working: a disabled skill can be edited, restored and published.
- \`enabled: true\` offers it again at its published snapshot. A skill that was never published stays invisible to consumers either way.
- A real change increases \`version\` by one. Sending the value the skill already has writes nothing and returns it unchanged, same \`version\`; \`expectedVersion\` is checked first all the same.
- This is the way to withdraw a skill from consumers without deleting it: there is no "unpublish".`,
    ),
    ApiIdParam('id', SKILL_ID_TEXT, SKILL_ID),
    ApiJsonBody({
      name: 'SkillsAvailabilityBody',
      description: 'The wanted availability and the `version` the skill was read at.',
      contract: skillAvailabilityInputSchema,
      describe: {
        expectedVersion: EXPECTED_VERSION_TEXT,
        enabled:
          '`false` hides the skill from consumers, `true` offers it again. A JSON boolean: the string `"false"` is refused.',
      },
      examples: {
        disable: {
          summary: 'Hide the skill from consumers',
          value: { expectedVersion: 4, enabled: false },
        },
        enable: {
          summary: 'Offer it again',
          value: { expectedVersion: 5, enabled: true },
        },
      },
    }),
    ApiEnvelopeResponse({
      name: 'SkillsAvailabilityChanged',
      description: 'The skill after the change, files included.',
      contract: skillEnvelopeSchema,
      describe: SKILL_DETAIL_DESCRIBE,
      data: SKILL_EXAMPLE.disabled,
      more: {
        enabledAgain: { summary: 'Switched on again', data: SKILL_EXAMPLE.enabledAgain },
      },
    }),
    ApiErrors(
      PROBLEM.validation(
        '`enabled` is missing or not a JSON boolean.',
        'enabled must be a boolean value',
      ),
      SKILL_EXPECTED_VERSION_INVALID,
      PROBLEM.unknownField,
      PROBLEM.invalidJson,
      ...SKILL_PRIVATE_PROBLEMS,
      PROBLEM.notFound('skill'),
      SKILL_VERSION_CONFLICT,
      SKILL_BODY_TOO_LARGE,
    ),
  );

export const DocPublishSkill = () =>
  applyDecorators(
    ApiRoute(
      'Publish the current snapshot of a skill',
      `Makes the current snapshot the one consumers receive: \`publishedVersion\` becomes \`currentVersion\`, \`status\` becomes \`published\`, \`version\` increases by one and the snapshot records the publication time (\`publishedAt\` in the history).

- A published snapshot is immutable: a later edit stores a new snapshot and consumers keep this one until the next publication.
- Publishing a restored snapshot works the same way, so an older content can be published again.
- When the current snapshot is already the published one, nothing is written and the skill comes back unchanged, same \`version\`; \`expectedVersion\` is checked first all the same.
- A disabled skill can be published; it stays hidden from consumers until it is enabled.
- There is no "unpublish": to withdraw a skill, disable it (\`PUT /api/skills/{id}/availability\`) or delete it.`,
    ),
    ApiIdParam('id', SKILL_ID_TEXT, SKILL_ID),
    ApiJsonBody({
      name: 'SkillsPublishBody',
      description:
        'The `version` the skill was read at. What gets published is the current snapshot.',
      contract: skillVersionInputSchema,
      describe: { expectedVersion: EXPECTED_VERSION_TEXT },
      examples: {
        first: {
          summary: 'First publication of a skill that was just created',
          value: { expectedVersion: 1 },
        },
        edit: {
          summary: 'Publish an edit made after a first publication',
          value: { expectedVersion: 3 },
        },
      },
    }),
    ApiEnvelopeResponse({
      name: 'SkillsPublished',
      description: 'The skill after the publication, files included.',
      contract: skillEnvelopeSchema,
      describe: SKILL_DETAIL_DESCRIBE,
      data: SKILL_EXAMPLE.published,
      more: {
        edit: {
          summary: 'An edit published: snapshot 2 replaces snapshot 1 for consumers',
          data: SKILL_EXAMPLE.republished,
        },
      },
    }),
    ApiErrors(
      SKILL_EXPECTED_VERSION_INVALID,
      PROBLEM.unknownField,
      PROBLEM.invalidJson,
      ...SKILL_PRIVATE_PROBLEMS,
      PROBLEM.notFound('skill'),
      SKILL_VERSION_CONFLICT,
      SKILL_BODY_TOO_LARGE,
    ),
  );
