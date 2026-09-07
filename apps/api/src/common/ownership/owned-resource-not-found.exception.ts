import { NotFoundException } from '@nestjs/common';

/** Missing and foreign resources deliberately share the same exception and envelope. */
export class OwnedResourceNotFoundException extends NotFoundException {
  readonly code: string;

  constructor(resourceName: string) {
    const code = `${resourceName}_not_found`;
    const label = resourceName.charAt(0).toUpperCase() + resourceName.slice(1).replaceAll('_', ' ');
    super(Object.freeze({ code, message: `${label} not found.` }));
    this.code = code;
  }
}
