import {
  currentWorkspacesEnvelopeSchema,
  publicUserSchema,
  successEnvelopeSchema,
} from '@alfred/contracts';
import { applyDecorators } from '@nestjs/common';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  ApiRoute,
} from '../../common/api-docs/api-docs.decorators';
import { PROBLEM } from '../../common/api-docs/api-problems';

/** No envelope contract is exported for the account; it is built from the shared pieces. */
const currentUserEnvelopeSchema = successEnvelopeSchema(publicUserSchema);

/**
 * Both routes read the account (`UsersService.findActiveById`, `WorkspacesService.currentFor`), so
 * they answer the guard's three refusals and "Account is unavailable".
 */
const PRIVATE_PROBLEMS = [...PROBLEM.session, PROBLEM.accountUnavailable];

/**
 * The account fields under a prefix: `data.` here, `data.user.` wherever a session carries the
 * account. Worded once, so the pages that show an account cannot describe it differently.
 */
export const publicUserFields = (prefix: string): Readonly<Record<string, string>> => ({
  [`${prefix}avatarUrl`]:
    'Address of the profile picture given by the identity provider. **Omitted**, never `null`, when the provider gave none: fall back to initials.',
  [`${prefix}displayName`]:
    'Name to show for the account, as given by the identity provider at the last sign-in; the e-mail address when the provider gave no name.',
  [`${prefix}email`]:
    'E-mail address of the account, verified by the identity provider and refreshed at every sign-in. Unique across accounts.',
  [`${prefix}id`]:
    'UUID of the account, stable across sign-ins: the `sub` claim of its access tokens and the owner of every resource it creates.',
  [`${prefix}role`]:
    '`user` for a regular account (the role of every new account), `admin` for an administrator. Kept by Alfred: neither a sign-in nor any route of this API changes it. No route of this version is restricted to a role, so the value changes nothing a caller can observe today; a restricted route would answer `403` `HTTP_403` "Insufficient permissions". An access token carries it as its `role` claim, as it was when the token was issued.',
});

/** The two accounts of every example that shows an account, so the pages read as one story. */
export const EXAMPLE_MEMBER = {
  avatarUrl: 'https://avatars.example.test/camille-martin.png',
  displayName: 'Camille Martin',
  email: 'camille.martin@example.test',
  id: '7c1e2f4a-8b3d-4c6e-9f10-2a5b7d8e9c01',
  role: 'user',
};
/** An administrator whose identity provider gave no picture. */
export const EXAMPLE_ADMINISTRATOR = {
  displayName: 'Noor Haddad',
  email: 'noor.haddad@example.test',
  id: 'b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e',
  role: 'admin',
};

const tenant = { id: '8a4c1e7b-2d9f-4b3a-a6c5-0f1e2d3c4b5a', name: 'Default tenant' };

export const DocGetCurrentUser = () =>
  applyDecorators(
    ApiRoute(
      'Read the signed-in account',
      `The profile of the account the access token belongs to. The account is the subject of the token: the route takes no parameter and can never return someone else.

- The profile is read from the database on every call, not from the token, so it is current even when the token is older than the last change.
- \`displayName\`, \`email\` and \`avatarUrl\` come from the identity provider and are refreshed at every sign-in; they cannot be edited through this API. \`role\` is kept by Alfred: a sign-in never changes it, and it restricts no route of this version.
- An account that was disabled or deleted after the token was issued answers \`401\` "Account is unavailable", even though the token itself is still valid.`,
    ),
    ApiEnvelopeResponse({
      name: 'UsersCurrentAccount',
      description: 'The signed-in account.',
      contract: currentUserEnvelopeSchema,
      describe: publicUserFields('data.'),
      data: EXAMPLE_MEMBER,
      more: {
        withoutAvatar: {
          summary: 'An administrator whose identity provider gave no picture: no `avatarUrl`',
          data: EXAMPLE_ADMINISTRATOR,
        },
      },
    }),
    ApiErrors(...PRIVATE_PROBLEMS),
  );

export const DocGetCurrentWorkspaces = () =>
  applyDecorators(
    ApiRoute(
      'Read the organisation and the workspaces of the signed-in account',
      `The tenant (organisation) the signed-in account belongs to and the workspaces it is a member of.

- Unrelated to the \`teams\` capability, which is the specialist agent catalog (\`GET /api/agents\`): this route depends on no capability and is always available.
- Only **active** workspaces are listed; an archived one is left out. The list can therefore be empty, which is not an error.
- Workspaces are created, renamed, archived and assigned by an operator of the deployment: no route of this API changes them, and no route takes a tenant or a workspace identifier as input.
- Workspaces are sorted by \`name\` with French collation, then by \`id\`, so the order is stable between calls.
- This is organisational membership only: it **grants no access** to the resources of other members. Every resource of this API stays owned by one account.
- A new account is made a member of the default workspace of its tenant at its first sign-in.
- The route takes no parameter and no pagination: the whole list comes in one answer.`,
    ),
    ApiEnvelopeResponse({
      name: 'UsersCurrentWorkspaces',
      description: 'The tenant and the active workspaces of the account.',
      contract: currentWorkspacesEnvelopeSchema,
      describe: {
        'data.tenant': 'The organisation the account belongs to. Exactly one per account.',
        'data.tenant.id':
          'UUID of the tenant. No route of this version takes it as input: use it as a stable key (of a cache, for instance), never as a scope to send.',
        'data.tenant.name': 'Display name of the tenant, 1 to 160 characters.',
        'data.workspaces':
          'The active workspaces the account is a member of, sorted by `name` then `id`. Empty when the account is a member of no active workspace.',
        'data.workspaces[].id':
          'UUID of the workspace, unchanged when an operator renames it: key a selection on it, not on `name`. No route of this version takes it as input.',
        'data.workspaces[].name': 'Display name of the workspace, 1 to 160 characters.',
      },
      data: {
        tenant,
        workspaces: [
          { id: '2b7e4d1a-9c3f-4e8b-8a6d-5f0c1b2a3d4e', name: 'Conformité' },
          { id: 'e9a1c5d3-4b7f-4d2e-9c8a-6b5d4e3f2a1b', name: 'Équipe générale' },
        ],
      },
      more: {
        none: {
          summary: 'Every workspace of the account is archived: an empty list, not an error',
          data: { tenant, workspaces: [] },
        },
      },
    }),
    ApiErrors(...PRIVATE_PROBLEMS),
  );
