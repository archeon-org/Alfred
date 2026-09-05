export interface OauthStateInput {
  readonly providerContext: Readonly<Record<string, string>>;
  readonly providerKey: string;
  readonly returnTo: string;
}

export interface ConsumedOauthState {
  readonly providerContext: Readonly<Record<string, string>>;
  readonly providerKey: string;
  readonly returnTo: string;
}

export interface OauthStatePort {
  create(input: OauthStateInput): Promise<string>;
  consume(
    providerKey: string,
    queryState: string,
    cookieState: string | undefined,
  ): Promise<ConsumedOauthState>;
}

export const OAUTH_STATE_PORT = Symbol('OAUTH_STATE_PORT');
