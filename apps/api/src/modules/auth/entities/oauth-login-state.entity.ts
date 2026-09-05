import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'oauth_login_states' })
@Index('idx_oauth_login_states_expiry', ['expiresAt'])
export class OauthLoginStateEntity {
  @PrimaryColumn({
    name: 'state_hash',
    type: 'char',
    length: 64,
    primaryKeyConstraintName: 'pk_oauth_login_states',
  })
  stateHash!: string;

  @Column({ name: 'code_verifier', type: 'varchar', length: 128 })
  codeVerifier!: string;

  @Column({ type: 'varchar', length: 128 })
  nonce!: string;

  @Column({ name: 'return_to', type: 'varchar', length: 2048, default: '/app' })
  returnTo!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
