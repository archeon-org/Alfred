import { Injectable, type LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RequestContextService } from './request-context.service';

type LogLevel = 'debug' | 'error' | 'info' | 'warn';

const PRIORITY: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};
const MAX_STACK_LENGTH = 4_096;
const SAFE_ERROR_NAME = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/u;

interface ErrorDiagnostic {
  readonly errorMessage: string;
  readonly errorName: string;
}

function looksLikeStack(value: string): boolean {
  return /\n\s+at\s/u.test(value);
}

function redactSecrets(value: string): string {
  return value
    .replace(/\bBearer\s+[^\s,;)]*/giu, 'Bearer [REDACTED]')
    .replace(/\bBasic\s+[A-Za-z0-9+/=]+/gu, 'Basic [REDACTED]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, '[REDACTED_EMAIL]')
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/giu, '$1[REDACTED]@')
    .replace(
      /\b([a-z0-9_-]*(?:authorization|cookie|password|passwd|secret|token|api[-_]?key)[a-z0-9_-]*)\s*[:=]\s*[^\s,;)]*/giu,
      '$1=[REDACTED]',
    );
}

function classifyErrorMessage(value: string): string {
  if (/\b(?:ECONNREFUSED|connection refused)\b/iu.test(value)) return 'connection refused';
  if (/\brelation\s+(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)\s+does not exist\b/iu.test(value)) {
    return 'database relation does not exist';
  }
  if (/\b(?:ETIMEDOUT|timed out)\b/iu.test(value)) return 'operation timed out';
  if (/\b(?:ECONNRESET|connection reset)\b/iu.test(value)) return 'connection reset';
  if (/\b(?:ENOTFOUND|getaddrinfo)\b/iu.test(value)) return 'host lookup failed';
  if (/\bdeadlock detected\b/iu.test(value)) return 'database deadlock';
  if (/\b(?:duplicate key|unique constraint)\b/iu.test(value)) {
    return 'database constraint violation';
  }
  return 'details redacted';
}

function errorDiagnostic(
  error: Error | undefined,
  stackCandidate: string | undefined,
): ErrorDiagnostic | undefined {
  const header = stackCandidate?.split(/\r?\n/u, 1)[0];
  const headerMatch = header?.match(/^([^:]+):\s*(.*)$/u);
  const rawName = error?.name ?? headerMatch?.[1];
  const rawMessage = error?.message ?? headerMatch?.[2];
  if (rawName === undefined || rawMessage === undefined) return undefined;

  return {
    errorMessage: classifyErrorMessage(rawMessage),
    errorName: SAFE_ERROR_NAME.test(rawName) ? rawName : 'Error',
  };
}

function sanitizeStack(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;

  const frames = value
    .split(/\r?\n/u)
    .filter((line) => /^\s*at\s/u.test(line))
    .join('\n');
  const sanitizedFrames = redactSecrets(frames).slice(0, MAX_STACK_LENGTH);

  return sanitizedFrames === '' ? undefined : sanitizedFrames;
}

@Injectable()
export class JsonLoggerService implements LoggerService {
  private readonly threshold: number;

  constructor(
    config: ConfigService,
    private readonly requestContext: RequestContextService,
  ) {
    this.threshold = PRIORITY[config.getOrThrow<LogLevel>('OBSERVABILITY_LOG_LEVEL')];
  }

  log(message: unknown, ...optionalParameters: unknown[]): void {
    this.write('info', message, optionalParameters);
  }

  error(message: unknown, ...optionalParameters: unknown[]): void {
    this.write('error', message, optionalParameters);
  }

  warn(message: unknown, ...optionalParameters: unknown[]): void {
    this.write('warn', message, optionalParameters);
  }

  debug(message: unknown, ...optionalParameters: unknown[]): void {
    this.write('debug', message, optionalParameters);
  }

  verbose(message: unknown, ...optionalParameters: unknown[]): void {
    this.write('debug', message, optionalParameters);
  }

  fatal(message: unknown, ...optionalParameters: unknown[]): void {
    this.write('error', message, optionalParameters);
  }

  httpRequestCompleted(fields: {
    readonly durationMs: number;
    readonly method: string;
    readonly route: string;
    readonly statusCode: number;
  }): void {
    this.write('info', 'HTTP request completed', [], {
      event: 'http_request_completed',
      ...fields,
    });
  }

  private write(
    level: LogLevel,
    message: unknown,
    optionalParameters: readonly unknown[],
    fields: Readonly<Record<string, number | string>> = {},
  ): void {
    if (PRIORITY[level] < this.threshold) return;

    const requestContext = this.requestContext.current();
    const stringParameters = optionalParameters.filter(
      (parameter): parameter is string => typeof parameter === 'string',
    );
    const errorParameter = optionalParameters.find(
      (parameter): parameter is Error => parameter instanceof Error,
    );
    const error = message instanceof Error ? message : errorParameter;
    const stackCandidate =
      error?.stack ?? stringParameters.find((parameter) => looksLikeStack(parameter));
    const stack = level === 'error' ? sanitizeStack(stackCandidate) : undefined;
    const diagnostic = level === 'error' ? errorDiagnostic(error, stackCandidate) : undefined;
    const nestContext = stringParameters.findLast((parameter) => parameter !== stackCandidate);
    const record = {
      ...(requestContext ?? {}),
      ...(nestContext === undefined ? {} : { context: nestContext }),
      ...(diagnostic ?? {}),
      ...(stack === undefined ? {} : { stack }),
      ...fields,
      level,
      message: message instanceof Error ? 'Unhandled application error' : String(message),
      timestamp: new Date().toISOString(),
    };
    const destination = level === 'error' ? process.stderr : process.stdout;

    destination.write(`${JSON.stringify(record)}\n`);
  }
}
