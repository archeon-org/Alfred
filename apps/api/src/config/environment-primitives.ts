import { z } from 'zod';

/** An empty or blank value means "not set": Compose passes `${KEY:-}` for every optional key. */
export const emptyStringToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

/** `true` / `false` as the environment spells them; anything else fails validation. */
export const booleanFromEnvironment = z.preprocess((value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean());
