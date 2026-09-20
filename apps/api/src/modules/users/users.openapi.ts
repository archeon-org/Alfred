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
  type ApiProblem,
} from '../../common/api-docs/api-docs.decorators';
import { PROBLEM } from '../../common/api-docs/api-problems';

/** No envelope contract is exported for the account; it is built from the shared pieces. */
const currentUserEnvelopeSchema = successEnvelopeSchema(publicUserSchema);

const ACCOUNT_UNAVAILABLE: ApiProblem = {
  status: 401,
  code: 'HTTP_401',
  message: 'Account is unavailable',
  when: 'The access token is valid but its account no longer exists or has been disabled. Refreshing the session does not help: sign the user out.',
};

const PRIVATE_PROBLEMS: readonly ApiProblem[] = [
  PROBLEM.unauthenticated,
  PROBLEM.invalidToken,
  ACCOUNT_UNAVAILABLE,
];

/** The same two accounts as the session examples of `/api/auth`, so the pages read as one story. */
const account = {
  avatarUrl: 'https://avatars.example.test/camille-martin.png',
  displayName: 'Camille Martin',
  email: 'camille.martin@example.test',
  id: '7c1e2f4a-8b3d-4c6e-9f10-2a5b7d8e9c01',
  role: 'user',
};

const tenant = { id: '8a4c1e7b-2d9f-4b3a-a6c5-0f1e2d3c4b5a', name: 'Default tenant' };

export const DocGetCurrentUser = () =>
  applyDecorators(
    ApiRoute(
      'Read the signed-in account',
      `The profile of the account the access token belongs to. The account is the subject of the token: the route takes no parameter and can never return someone else.

- The profile is read from the database on every call, not from the token, so it is current even when the token is older than the last change.
- \`displayName\`, \`email\` and \`avatarUrl\` come from the identity provider and are refreshed at every sign-in; they cannot be edited through this API. \`role\` is managed by Alfred.
- An account that was disabled or deleted after the token was issued answers \`401\` "Account is unavailable", even though the token itself is still valid.`,
    ),
    ApiEnvelopeResponse({
      name: 'UsersCurrentAccount',
      description: 'The signed-in account.',
      contract: currentUserEnvelopeSchema,
      describe: {
        'data.avatarUrl':
          'Address of the profile picture given by the identity provider. **Omitted**, never `null`, when the provider gave none: fall back to initials.',
        'data.displayName':
          'Name to show for the account, as given by the identity provider at the last sign-in; the e-mail address when the provider gave no name.',
        'data.email': 'E-mail address of the account, unique across accounts.',
        'data.id':
          'UUID of the account: the `sub` claim of its access tokens and the owner of every resource it creates.',
        'data.role':
          '`user` for a regular account (the role of every new account), `admin` for an administrator. Routes restricted to a role answer `403` to the others.',
      },
      data: account,
      more: {
        withoutAvatar: {
          summary: 'An administrator whose identity provider gave no picture: no `avatarUrl`',
          data: {
            displayName: 'Noor Haddad',
            email: 'noor.haddad@example.test',
            id: 'b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e',
            role: 'admin',
          },
        },
      },
    }),
    ApiErrors(...PRIVATE_PROBLEMS),
  );

export const DocGetCurrentWorkspaces = () =>
  applyDecorators(
    ApiRoute(
      'Read the organisation and the teams of the signed-in account',
      `The tenant (organisation) the signed-in account belongs to and the workspaces (teams) it is a member of.

- Only **active** workspaces are listed; an archived one is left out. The list can therefore be empty, which is not an error.
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
        'data.tenant.id': 'Identifier of the tenant.',
        'data.tenant.name': 'Display name of the tenant, 1 to 160 characters.',
        'data.workspaces':
          'The active workspaces the account is a member of, sorted by `name` then `id`. Empty when every workspace of the account is archived.',
        'data.workspaces[].id': 'Identifier of the workspace.',
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
