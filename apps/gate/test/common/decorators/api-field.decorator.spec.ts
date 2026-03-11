import 'reflect-metadata';
import { validateSync } from 'class-validator';
import { DECORATORS } from '@nestjs/swagger/dist/constants';
import {
  OptionalBooleanField,
  OptionalEnumField,
  OptionalJsonField,
  OptionalStringField,
  OptionalUuidArrayField,
  OptionalUuidField,
  UuidArrayField,
  UuidField,
} from 'src/common/decorators/api-field.decorator';

enum TestStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

class OptionalFieldsDto {
  @OptionalStringField({ example: 'hello' })
  text?: string;

  @OptionalUuidField({ example: 'd290f1ee-6c54-4b01-90e6-d701748f0851' })
  id?: string;

  @OptionalUuidArrayField({ type: [String] })
  ids?: string[];

  @OptionalJsonField({ example: '{"key":"value"}' })
  metadata?: string;

  @OptionalEnumField(TestStatus, { enumName: 'TestStatus' })
  status?: TestStatus;

  @OptionalBooleanField({ example: true })
  enabled?: boolean;
}

class RequiredFieldsDto {
  @UuidArrayField({ type: [String] })
  ids: string[];

  @UuidField({ type: String })
  id: string;
}

describe('API field decorators', () => {
  it('allows missing optional values', () => {
    const dto = new OptionalFieldsDto();
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('validates optional fields when values are provided', () => {
    const dto = new OptionalFieldsDto();
    dto.text = 42 as any;
    dto.id = 'not-a-uuid';
    dto.ids = ['not-a-uuid'];
    dto.metadata = 'not-json';
    dto.status = 'UNKNOWN' as any;
    dto.enabled = 'yes' as any;

    const errors = validateSync(dto);
    const properties = errors.map((error) => error.property);

    expect(properties).toEqual(
      expect.arrayContaining([
        'text',
        'id',
        'ids',
        'metadata',
        'status',
        'enabled',
      ]),
    );
  });

  it('validates required uuid and uuid array fields', () => {
    const dto = new RequiredFieldsDto();
    const errors = validateSync(dto);
    const properties = errors.map((error) => error.property);

    expect(properties).toEqual(expect.arrayContaining(['ids', 'id']));
  });

  it('applies swagger metadata for decorated fields', () => {
    const optionalMeta = Reflect.getMetadata(
      DECORATORS.API_MODEL_PROPERTIES,
      OptionalFieldsDto.prototype,
      'text',
    );
    const requiredMeta = Reflect.getMetadata(
      DECORATORS.API_MODEL_PROPERTIES,
      RequiredFieldsDto.prototype,
      'id',
    );

    expect(optionalMeta).toBeDefined();
    expect(requiredMeta).toBeDefined();
  });
});
