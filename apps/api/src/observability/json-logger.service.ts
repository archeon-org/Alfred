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

    const context = this.requestContext.current();
    const nestContext = optionalParameters.findLast(
      (parameter): parameter is string => typeof parameter === 'string',
    );
    const record = {
      ...(context ?? {}),
      ...(nestContext === undefined ? {} : { context: nestContext }),
      ...fields,
      level,
      message: message instanceof Error ? message.message : String(message),
      timestamp: new Date().toISOString(),
    };
    const destination = level === 'error' ? process.stderr : process.stdout;

    destination.write(`${JSON.stringify(record)}\n`);
  }
}
