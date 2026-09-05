import { getMetadataArgsStorage } from 'typeorm';
import { describe, expect, it } from 'vitest';

import { OauthLoginStateEntity } from '../../src/modules/auth/entities/oauth-login-state.entity';
import { RefreshSessionEntity } from '../../src/modules/auth/entities/refresh-session.entity';
import { UserEntity } from '../../src/modules/users/user.entity';
import { UserIdentityEntity } from '../../src/modules/users/user-identity.entity';

function metadataNames<T extends { readonly name?: string }>(values: readonly T[]): string[] {
  return values.flatMap(({ name }) => (name === undefined ? [] : [name])).sort();
}

describe('entity schema contract', () => {
  it('uses stable names for identity constraints and indexes', () => {
    const metadata = getMetadataArgsStorage();

    expect(metadataNames(metadata.indices.filter(({ target }) => target === UserEntity))).toEqual([
      'uq_users_email',
    ]);
    expect(
      metadataNames(metadata.indices.filter(({ target }) => target === UserIdentityEntity)),
    ).toEqual(['idx_user_identities_user', 'uq_user_identities_issuer_subject']);
    expect(metadataNames(metadata.checks.filter(({ target }) => target === UserEntity))).toEqual([
      'chk_users_role',
      'chk_users_status',
    ]);
    expect(
      metadataNames(metadata.indices.filter(({ target }) => target === OauthLoginStateEntity)),
    ).toEqual(['idx_oauth_login_states_expiry']);
    expect(
      metadataNames(metadata.indices.filter(({ target }) => target === RefreshSessionEntity)),
    ).toEqual([
      'idx_refresh_sessions_expiry',
      'idx_refresh_sessions_family',
      'idx_refresh_sessions_replacement',
      'idx_refresh_sessions_user',
      'uq_refresh_sessions_token_hash',
    ]);
  });

  it('keeps external identities separate from the application user', () => {
    const metadata = getMetadataArgsStorage();
    const identityRelation = metadata.relations.find(
      ({ propertyName, target }) => target === UserIdentityEntity && propertyName === 'user',
    );

    expect(identityRelation?.options).toMatchObject({ onDelete: 'CASCADE' });
    expect(
      metadata.columns.some(
        ({ propertyName, target }) => target === UserEntity && propertyName === 'googleSubject',
      ),
    ).toBe(false);
  });

  it('models the refresh replacement as a self-referencing foreign key', () => {
    const metadata = getMetadataArgsStorage();
    const replacementRelation = metadata.relations.find(
      ({ propertyName, target }) =>
        target === RefreshSessionEntity && propertyName === 'replacedBySession',
    );
    const replacementJoin = metadata.joinColumns.find(
      ({ propertyName, target }) =>
        target === RefreshSessionEntity && propertyName === 'replacedBySession',
    );

    expect(replacementRelation?.options).toMatchObject({ nullable: true, onDelete: 'SET NULL' });
    expect(replacementJoin).toMatchObject({
      foreignKeyConstraintName: 'fk_refresh_sessions_replacement',
      name: 'replaced_by_session_id',
    });
  });
});
