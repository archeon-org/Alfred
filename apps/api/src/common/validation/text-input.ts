import { registerDecorator, type ValidationOptions } from 'class-validator';

/** Pure, side-effect-free transforms for `@Transform()` on idempotent request DTOs. */
export function trimmedString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** Normalizes line endings so stored Markdown compares and hashes consistently. */
export function normalizedText(value: unknown): unknown {
  return typeof value === 'string' ? value.replaceAll('\r\n', '\n') : value;
}

export function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

/** Bounds UTF-8 size, which is what PostgreSQL `octet_length` enforces, unlike `@MaxLength`. */
export function MaxByteLength(max: number, options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      constraints: [max],
      name: 'maxByteLength',
      options: {
        message: `$property must not exceed ${max} bytes`,
        ...options,
      },
      propertyName: String(propertyName),
      target: target.constructor,
      validator: {
        validate: (value: unknown) => typeof value === 'string' && utf8ByteLength(value) <= max,
      },
    });
  };
}
