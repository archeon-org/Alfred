import type { S3CommandSender } from '@api/modules/files/infrastructure/storage/s3-content.store';

interface StoredObject {
  readonly body: Buffer;
  readonly contentType?: string | undefined;
}

/** The error shapes the SDK raises, by the names the adapter tells apart. */
export class FakeS3Error extends Error {
  readonly $metadata: { readonly httpStatusCode: number };

  constructor(
    override readonly name: string,
    httpStatusCode: number,
  ) {
    super(name);
    this.$metadata = { httpStatusCode };
  }
}

/**
 * An S3 service that answers the commands this adapter sends, with the errors the real SDK
 * raises: `NoSuchKey` for a read, `NotFound` for a bodiless `HEAD`, `NoSuchBucket` when the
 * bucket does not exist. It keeps key building, command inputs and error mapping under test
 * without a bucket; a real provider is exercised by the MinIO suite.
 */
export class FakeS3 implements S3CommandSender {
  readonly objects = new Map<string, StoredObject>();
  readonly commands: { readonly name: string; readonly input: Record<string, unknown> }[] = [];
  destroyed = false;

  constructor(private readonly options: { readonly bucketExists?: boolean } = {}) {}

  send(command: object): Promise<unknown> {
    try {
      return Promise.resolve(this.answer(command));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  destroy(): void {
    this.destroyed = true;
  }

  inputFor(commandName: string): Record<string, unknown> | undefined {
    return this.commands.find((command) => command.name === commandName)?.input;
  }

  private answer(command: object): unknown {
    const { constructor, input } = command as {
      constructor: { name: string };
      input: Record<string, unknown>;
    };
    const name = constructor.name;
    const key = String(input.Key);
    this.commands.push({ name, input });
    const bucketMissing = this.options.bucketExists === false;

    switch (name) {
      case 'HeadBucketCommand':
        if (bucketMissing) throw new FakeS3Error('NotFound', 404);
        return {};
      case 'PutObjectCommand':
        if (bucketMissing) throw new FakeS3Error('NoSuchBucket', 404);
        this.objects.set(key, {
          body: Buffer.from(input.Body as Buffer),
          contentType: input.ContentType as string | undefined,
        });
        return {};
      case 'GetObjectCommand': {
        if (bucketMissing) throw new FakeS3Error('NoSuchBucket', 404);
        const stored = this.objects.get(key);
        if (stored === undefined) throw new FakeS3Error('NoSuchKey', 404);
        return {
          Body: { transformToByteArray: (): Promise<Uint8Array> => Promise.resolve(stored.body) },
        };
      }
      case 'HeadObjectCommand':
        // A bodiless 404: the SDK cannot tell a missing bucket from a missing key here.
        if (bucketMissing || !this.objects.has(key)) throw new FakeS3Error('NotFound', 404);
        return {};
      case 'DeleteObjectCommand':
        if (bucketMissing) throw new FakeS3Error('NoSuchBucket', 404);
        this.objects.delete(key);
        return {};
      default:
        throw new Error(`Unexpected command ${name}`);
    }
  }
}
