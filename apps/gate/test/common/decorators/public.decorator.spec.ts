import 'reflect-metadata';
import { IS_PUBLIC_KEY, Public } from 'src/common/decorators/public.decorator';

describe('Public decorator', () => {
  it('sets public metadata on a method', () => {
    class TestController {
      @Public()
      handler() {}
    }

    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, TestController.prototype.handler),
    ).toBe(true);
  });
});
