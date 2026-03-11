import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsJSON,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

type OptionalApiFieldOptions = Parameters<typeof ApiPropertyOptional>[0];
type RequiredApiFieldOptions = Parameters<typeof ApiProperty>[0];

export function OptionalStringField(
  options: OptionalApiFieldOptions,
): PropertyDecorator {
  return applyDecorators(
    ApiPropertyOptional(options),
    IsOptional(),
    IsString(),
  );
}

export function OptionalUuidField(
  options: OptionalApiFieldOptions,
): PropertyDecorator {
  return applyDecorators(ApiPropertyOptional(options), IsOptional(), IsUUID());
}

export function OptionalUuidArrayField(
  options: OptionalApiFieldOptions,
): PropertyDecorator {
  return applyDecorators(
    ApiPropertyOptional(options),
    IsOptional(),
    IsUUID('4', { each: true }),
  );
}

export function OptionalJsonField(
  options: OptionalApiFieldOptions,
): PropertyDecorator {
  return applyDecorators(ApiPropertyOptional(options), IsOptional(), IsJSON());
}

export function OptionalEnumField(
  enumType: object,
  options: OptionalApiFieldOptions,
): PropertyDecorator {
  return applyDecorators(
    ApiPropertyOptional({ ...options, enum: enumType }),
    IsOptional(),
    IsEnum(enumType),
  );
}

export function OptionalBooleanField(
  options: OptionalApiFieldOptions,
): PropertyDecorator {
  return applyDecorators(
    ApiPropertyOptional(options),
    IsOptional(),
    IsBoolean(),
  );
}

export function UuidArrayField(
  options: RequiredApiFieldOptions,
): PropertyDecorator {
  return applyDecorators(
    ApiProperty(options),
    IsArray(),
    IsUUID('4', { each: true }),
  );
}

export function UuidField(options: RequiredApiFieldOptions): PropertyDecorator {
  return applyDecorators(ApiProperty(options), IsUUID());
}
