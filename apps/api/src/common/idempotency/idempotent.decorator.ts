import { SetMetadata } from '@nestjs/common';

export const IDEMPOTENT_KEY = 'alfred:idempotent';

/** Opt in a private, finite JSON handler. Never use for credentials, streams or raw responses. */
export const Idempotent = (): MethodDecorator => SetMetadata(IDEMPOTENT_KEY, true);
