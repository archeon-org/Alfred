import { Request } from 'express';
import { UserEntity } from '@archeon-org/database';

export interface RagUserContext {
  user_id: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  email?: string;
  timezone: string;
  locale: string;
  current_date: string;
  current_datetime_iso: string;
  day_of_week: string;
}

const TIMEZONE_HEADER_KEYS = [
  'x-timezone',
  'x-user-timezone',
  'x-client-timezone',
] as const;

const TIMEZONE_PATTERN = /^[A-Za-z0-9_./+\-]{1,80}$/;

function pickHeader(req: Request, keys: readonly string[]): string | undefined {
  const getHeader =
    typeof req.header === 'function'
      ? (key: string) => req.header(key)
      : (key: string) => {
          const headers = (req as any).headers as Record<
            string,
            string | string[] | undefined
          >;
          const raw = headers?.[key] ?? headers?.[key.toLowerCase()];
          if (Array.isArray(raw)) {
            return raw[0];
          }
          return raw;
        };

  for (const key of keys) {
    const value = getHeader(key);
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function resolveTimezone(req: Request): string {
  const rawTimezone = pickHeader(req, TIMEZONE_HEADER_KEYS);
  if (!rawTimezone || !TIMEZONE_PATTERN.test(rawTimezone)) {
    return 'UTC';
  }

  try {
    Intl.DateTimeFormat('en-US', { timeZone: rawTimezone }).format(new Date());
    return rawTimezone;
  } catch {
    return 'UTC';
  }
}

function resolveLocale(req: Request): string {
  const header = pickHeader(req, ['accept-language']);
  if (!header) {
    return 'en-US';
  }
  const first = header.split(',')[0]?.trim();
  if (!first) {
    return 'en-US';
  }
  return first.slice(0, 32);
}

function resolveCurrentDate(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value || '1970';
  const month = parts.find((part) => part.type === 'month')?.value || '01';
  const day = parts.find((part) => part.type === 'day')?.value || '01';
  return `${year}-${month}-${day}`;
}

function resolveDayOfWeek(timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
  }).format(new Date());
}

export function buildRagUserContext(
  user: UserEntity,
  req: Request,
): RagUserContext {
  const timezone = resolveTimezone(req);
  const locale = resolveLocale(req);
  const firstName = user.firstName?.trim() || undefined;
  const lastName = user.lastName?.trim() || undefined;
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || undefined;

  return {
    user_id: user.id,
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    email: user.email?.trim() || undefined,
    timezone,
    locale,
    current_date: resolveCurrentDate(timezone),
    current_datetime_iso: new Date().toISOString(),
    day_of_week: resolveDayOfWeek(timezone),
  };
}
