import type { ApiProblem } from '../../../common/api-docs/api-docs.decorators';
import { PROBLEM } from '../../../common/api-docs/api-problems';

/** Shared by `skills.openapi.ts` and `skill-lifecycle.openapi.ts`: fields, examples and errors. */
export const SKILL_ID = '1456a6c1-9e22-4497-8efc-798ff8511ac2';
export const SKILL_ID_TEXT =
  'Identifier of a skill of the signed-in account, as listed by `GET /api/skills`.';

const SUMMARY_FIELDS = {
  enabled:
    'Whether consumers are offered the skill. `false` hides it from `GET /api/skills/published` without touching its content; every authoring route keeps working. `true` on creation; changed with `PUT /api/skills/{id}/availability`.',
  id: 'Stable identity of the skill. It survives renames, edits and restores.',
  name: 'Current name, the one of the current snapshot: a rename shows here before it is published. Lower-case kebab-case, unique among the skills of the account.',
  description: 'Current description, written for whoever decides when to use the skill.',
  version:
    'Optimistic-write token, not a content number. It increases by one each time the skill really changes (edit, restore, publication, availability). Send the last value read as `expectedVersion`.',
  currentVersion:
    'Number of the snapshot the skill points to: the content the authoring routes show and the one `publish` would publish. An edit allocates a new number (highest retained number + 1); a restore moves it back to an older number.',
  publishedVersion:
    'Number of the snapshot consumers receive; `null` while the skill was never published. Editing or restoring never moves it, only `POST /api/skills/{id}/publish` does.',
  status:
    '`published` when `currentVersion` equals `publishedVersion`; `draft` otherwise (never published, or changed since the last publication).',
  fileCount: 'Number of files of the current snapshot, 1 to 50.',
  totalBytes:
    'Sum of the decoded sizes of the current snapshot files, in bytes; at most 1 048 576.',
  createdAt: 'When the skill was created (UTC). The list is ordered by it.',
  updatedAt: 'Last change of the skill (UTC): edit, restore, publication or availability change.',
} as const;

const FILE_FIELDS = {
  files:
    'Every file of the current snapshot, read in `path` order of the database collation: do not depend on the order.',
  'files[].path': 'Path inside the package, `/`-separated and relative, exactly as it was sent.',
  'files[].mediaType': 'Media type recorded when the file was sent. The API never sniffs content.',
  'files[].contentBase64':
    'The exact bytes of the file, standard base64 with padding. Decode to bytes; only `.md` files are guaranteed to be UTF-8.',
} as const;

const prefixed = (prefix: string, fields: Readonly<Record<string, string>>) =>
  Object.fromEntries(Object.entries(fields).map(([field, text]) => [`${prefix}${field}`, text]));

/** `describe` of a `skillListEnvelopeSchema` answer. */
export const SKILL_LIST_DESCRIBE = prefixed('data.items[].', SUMMARY_FIELDS);
/** `describe` of a `skillEnvelopeSchema` answer. */
export const SKILL_DETAIL_DESCRIBE = prefixed('data.', { ...SUMMARY_FIELDS, ...FILE_FIELDS });

export const EXPECTED_VERSION_TEXT =
  'The `version` last read for this skill, 1 to 2 147 483 646. Any other current value answers `409 skill_version_conflict` and nothing is written.';

/** `describe` of the package fields of `skillWriteInputSchema` and `skillUpdateInputSchema`. */
export const SKILL_WRITE_DESCRIBE = {
  name: 'Lower-case kebab-case (`a-z`, `0-9`, single hyphens between groups), 1 to 64 characters, unique among the skills of the account. Must equal the `name` of the `SKILL.md` front matter.',
  description:
    '1 to 1 024 characters, not only white space, no NUL character, no unpaired surrogate. Must equal the `description` of the `SKILL.md` front matter. Write it for whoever decides when to use the skill.',
  files:
    'The whole package: 1 to 50 files (a deployment can lower the maximum) and at most 1 048 576 decoded bytes in total. It must hold a root `SKILL.md`. Paths are unique ignoring case and Unicode normalisation, and a path cannot be both a file and the folder of another file.',
  'files[].path':
    'Relative `/`-separated path, 1 to 240 characters, NFC-normalised. No empty, `.` or `..` segment (so no leading or trailing `/`), no segment with leading or trailing white space, no backslash, colon or control character. The case is kept as sent.',
  'files[].mediaType':
    'Media type as `type/subtype`, without parameters, 1 to 127 characters. Example: `text/markdown`. Stored as sent.',
  'files[].contentBase64':
    'The exact bytes of the file in canonical standard base64: `+` and `/` alphabet, `=` padding, no line break. At most 1 398 104 characters. A file whose path ends in `.md` must decode to UTF-8 text without NUL character.',
} as const;

const file = (path: string, mediaType: string, text: string) => ({
  path,
  mediaType,
  contentBase64: Buffer.from(text, 'utf8').toString('base64'),
});
const skillMd = (name: string, description: string, body: string) =>
  file(
    'SKILL.md',
    'text/markdown',
    `---\nname: ${name}\ndescription: ${description}\n---\n${body}`,
  );
type ExampleFile = ReturnType<typeof file>;
const decodedBytes = (files: readonly ExampleFile[]) =>
  files.reduce((total, item) => total + Buffer.from(item.contentBase64, 'base64').byteLength, 0);

const NAME = 'incident-runbook';
const DESCRIPTION = 'How to triage a production incident before escalating.';
const REVISED_DESCRIPTION = 'How to triage a production incident and when to page the on-call.';

/** Request examples: every one is a package the API accepts, front matter included. */
export const SKILL_PACKAGE = {
  name: NAME,
  description: DESCRIPTION,
  files: [skillMd(NAME, DESCRIPTION, 'Check the runbook first.')],
};
export const SKILL_PACKAGE_RENAMED = {
  name: 'incident-triage',
  description: DESCRIPTION,
  files: [skillMd('incident-triage', DESCRIPTION, 'Check the runbook first.')],
};
export const SKILL_PACKAGE_REVISED = {
  name: NAME,
  description: REVISED_DESCRIPTION,
  files: [
    skillMd(
      NAME,
      REVISED_DESCRIPTION,
      'Check the runbook first, then read `references/paging.md`.',
    ),
    file('references/paging.md', 'text/markdown', '# Paging\nPage the on-call after 15 minutes.\n'),
    file(
      'scripts/collect-logs.sh',
      'text/x-shellscript',
      '#!/bin/sh\nkubectl logs --since=15m "$1"\n',
    ),
  ],
};

type ExamplePackage = typeof SKILL_PACKAGE;
/** `[version, currentVersion, publishedVersion, updatedAt]` of the example skill at one moment. */
type ExampleState = readonly [number, number, number | null, string];
const CREATED_AT = '2026-09-18T09:12:31.204Z';

const summaryOf = (
  input: ExamplePackage,
  [version, currentVersion, publishedVersion, updatedAt]: ExampleState,
  enabled = true,
) => ({
  enabled,
  id: SKILL_ID,
  name: input.name,
  description: input.description,
  version,
  currentVersion,
  publishedVersion,
  status: currentVersion === publishedVersion ? 'published' : 'draft',
  fileCount: input.files.length,
  totalBytes: decodedBytes(input.files),
  createdAt: CREATED_AT,
  updatedAt,
});
const detailOf = (input: ExamplePackage, state: ExampleState, enabled = true) => ({
  ...summaryOf(input, state, enabled),
  files: input.files,
});

const EDITED: ExampleState = [3, 2, 1, '2026-09-19T14:02:48.530Z'];
const RELEASE_NOTES_TEXT = 'How to write the release notes of a delivery.';
const RELEASE_NOTES: ExamplePackage = {
  name: 'release-notes',
  description: RELEASE_NOTES_TEXT,
  files: [skillMd('release-notes', RELEASE_NOTES_TEXT, 'One line per change.')],
};

/** One skill through its life: created, published, edited, published again, restored, disabled. */
export const SKILL_EXAMPLE = {
  created: detailOf(SKILL_PACKAGE, [1, 1, null, CREATED_AT]),
  published: detailOf(SKILL_PACKAGE, [2, 1, 1, '2026-09-18T09:20:05.117Z']),
  edited: detailOf(SKILL_PACKAGE_REVISED, EDITED),
  republished: detailOf(SKILL_PACKAGE_REVISED, [4, 2, 2, '2026-09-19T14:05:10.961Z']),
  restored: detailOf(SKILL_PACKAGE, [5, 1, 2, '2026-09-20T08:31:22.340Z']),
  restoredToPublished: detailOf(SKILL_PACKAGE, [4, 1, 1, '2026-09-19T14:30:41.208Z']),
  disabled: detailOf(SKILL_PACKAGE_REVISED, [5, 2, 2, '2026-09-20T08:40:03.775Z'], false),
  enabledAgain: detailOf(SKILL_PACKAGE_REVISED, [6, 2, 2, '2026-09-20T09:02:17.660Z']),
  editedSummary: summaryOf(SKILL_PACKAGE_REVISED, EDITED),
  otherSummary: {
    ...summaryOf(RELEASE_NOTES, [1, 1, null, '2026-09-17T16:44:09.012Z']),
    id: '7c2e9d40-3b1a-4c8f-a6d5-0f9e8b7a6c51',
    createdAt: '2026-09-17T16:44:09.012Z',
  },
} as const;

export const SKILL_ACCOUNT_UNAVAILABLE: ApiProblem = {
  status: 401,
  code: 'HTTP_401',
  message: 'Account is unavailable',
  when: 'The access token is valid but its account no longer exists or is no longer active.',
};

/** Every skills route: private, and behind the `skills` capability (checked before the token). */
export const SKILL_PRIVATE_PROBLEMS: readonly ApiProblem[] = [
  PROBLEM.unauthenticated,
  PROBLEM.invalidToken,
  SKILL_ACCOUNT_UNAVAILABLE,
  PROBLEM.featureDisabled('skills'),
];

export const SKILL_VERSION_CONFLICT: ApiProblem = {
  status: 409,
  code: 'skill_version_conflict',
  message: 'The skill changed. Reload before saving.',
  when: '`expectedVersion` is not the current `version`: the skill changed since it was read (edit, restore, publication or availability change, possibly from another tab). There are no `details`: re-read it with `GET /api/skills/{id}`, reapply the change and send the new `version`. Never retry blindly.',
};

export const SKILL_NAME_CONFLICT: ApiProblem = {
  status: 409,
  code: 'skill_name_conflict',
  message: 'A skill with this name already exists.',
  when: 'Another skill of the account already has this `name`. Nothing was written. Choose another name, or update the existing skill.',
};

export const SKILL_QUOTA_EXCEEDED: ApiProblem = {
  status: 409,
  code: 'skill_storage_quota_exceeded',
  message: 'Skill storage quota exceeded. Delete unused skills to free space.',
  when: 'The decoded bytes of this package, added to every retained snapshot of every skill of the account, exceed the account quota (26 214 400 bytes unless the deployment changes it). Nothing was written. Deleting a skill frees all its snapshots.',
};

export const SKILL_BODY_TOO_LARGE: ApiProblem = {
  ...PROBLEM.bodyTooLarge,
  when: 'The JSON body exceeds 1 600 000 bytes, the limit of the skills routes.',
};

export const SKILL_EXPECTED_VERSION_INVALID = PROBLEM.validation(
  '`expectedVersion` is missing, not a JSON integer (a string is refused), or outside 1 to 2 147 483 646. The same answer when the body is missing.',
  'expectedVersion must not be greater than 2147483646',
);

const packageProblem = (message: string, when: string): ApiProblem => ({
  status: 400,
  code: 'skill_package_invalid',
  message,
  when,
});

/**
 * Package rules checked after the field rules, on create and update. One code, a French message
 * meant for the author; only the first broken rule is reported and nothing is written.
 */
export const SKILL_PACKAGE_PROBLEMS: readonly ApiProblem[] = [
  packageProblem(
    'Le package doit contenir SKILL.md à la racine.',
    'No file has the exact path `SKILL.md`. The case matters and `references/SKILL.md` does not count.',
  ),
  packageProblem(
    'SKILL.md doit contenir un en-tête YAML valide.',
    '`SKILL.md` does not start with a non-empty YAML front matter between two `---` lines, or the front matter exceeds 16 384 bytes.',
  ),
  packageProblem(
    'En-tête YAML invalide ou métadonnées incohérentes.',
    'The front matter is not valid YAML (core schema, no duplicate key, no alias), is not a mapping, or its `name` or `description` is not strictly equal to the body field. Other keys are allowed.',
  ),
  packageProblem(
    'SKILL.md dépasse la taille autorisée.',
    '`SKILL.md` exceeds 131 072 bytes (a deployment can lower this limit).',
  ),
  packageProblem(
    'Le package dépasse la taille autorisée.',
    'The decoded files exceed 1 048 576 bytes in total (a deployment can lower this limit), or one `contentBase64` alone is longer than that size allows.',
  ),
  packageProblem(
    'Nombre de fichiers non autorisé.',
    'More files than this deployment allows, when its maximum is below 50.',
  ),
  packageProblem(
    'Nom ou description invalide.',
    '`description` holds only white space, a NUL character or an unpaired surrogate.',
  ),
  packageProblem(
    'Le package contient des chemins dupliqués.',
    'Two paths are equal once case and Unicode normalisation are ignored, for example `SKILL.md` and `skill.md`.',
  ),
  packageProblem(
    'Un chemin désigne à la fois un fichier et un dossier.',
    'A path is also the folder of another file, for example `docs` and `docs/a.md`.',
  ),
  packageProblem(
    'Le chemin du fichier est invalide.',
    'A `path` is absolute, holds an empty, `.` or `..` segment, a segment with leading or trailing white space, a backslash, a colon, a control character or an unpaired surrogate, or is not NFC-normalised.',
  ),
  packageProblem(
    'Le contenu du fichier doit être encodé en base64 canonique.',
    'A `contentBase64` does not decode and re-encode to itself: missing padding, URL-safe alphabet, line breaks or characters outside base64.',
  ),
  packageProblem(
    'Le type du fichier est invalide.',
    'A `mediaType` is not `type/subtype` made of token characters; parameters such as `; charset=utf-8` are refused.',
  ),
  packageProblem(
    'Les fichiers Markdown doivent être en UTF-8.',
    'A file whose path ends in `.md` (any case) is not valid UTF-8, or holds a NUL character.',
  ),
];

/** Field rules of the package, checked first; one message per broken field. */
export const SKILL_WRITE_FIELDS_INVALID = PROBLEM.validation(
  'A field breaks its rule: `name` not lower-case kebab-case or over 64 characters, `description` empty or over 1 024 characters, `files` not a list of 1 to 50 entries, a file field missing, not a string or out of bounds. One message per broken field; file fields are prefixed with `files.<index>.`.',
  'name must match /^[a-z0-9]+(?:-[a-z0-9]+)*$/u regular expression',
  'files.0.path must be longer than or equal to 1 characters',
);
