import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  readonly requestId: string;
  readonly spanId: string;
  readonly traceId: string;
  readonly traceparent: string;
}

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run<T>(context: RequestContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  current(): RequestContext | undefined {
    return this.storage.getStore();
  }
}
