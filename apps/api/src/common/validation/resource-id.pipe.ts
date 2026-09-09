import type { PipeTransform } from '@nestjs/common';
import { OwnedResourceNotFoundException } from '../ownership/owned-resource-not-found.exception';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/**
 * Validates a `:id` route parameter. A malformed identifier cannot name any resource, so it gets
 * the same 404 as a missing or foreign one instead of revealing the identifier format (ALF-DEC-004).
 */
export class ResourceIdPipe implements PipeTransform<unknown, string> {
  constructor(private readonly resourceName: string) {}

  transform(value: unknown): string {
    if (typeof value !== 'string' || !uuid.test(value)) {
      throw new OwnedResourceNotFoundException(this.resourceName);
    }
    return value.toLowerCase();
  }
}
