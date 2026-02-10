declare module 'celery-node' {
  export interface TaskOptions {
    taskId?: string;
    eta?: Date;
    countdown?: number;
    expires?: Date | number;
    queue?: string;
    exchange?: string;
    routingKey?: string;
  }

  export interface TaskResult<T = unknown> {
    get(timeout?: number): Promise<T>;
    taskId: string;
  }

  export interface Task {
    name: string;

    applyAsync(
      args?: unknown[],
      kwargs?: Record<string, unknown>,
      options?: TaskOptions,
    ): Promise<TaskResult>;

    delay(...args: unknown[]): Promise<TaskResult>;
  }

  export interface Client {
    createTask(name: string): Task;
    disconnect(): Promise<void>;
    isReady(): boolean;
  }

  export interface Worker {
    register(
      name: string,
      handler: (...args: unknown[]) => Promise<unknown>,
    ): void;
    start(): Promise<void>;
    stop(): Promise<void>;
  }

  export interface CeleryOptions {
    broker?: string;
    backend?: string;
  }

  export function createClient(broker: string, backend?: string): Client;

  export function createWorker(broker: string, backend?: string): Worker;
}
