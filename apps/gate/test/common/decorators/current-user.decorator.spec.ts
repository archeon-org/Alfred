import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

describe('CurrentUser decorator', () => {
  const makeContext = (user: unknown) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as any;

  const getFactoryFor = (data: string | undefined) => {
    class TestController {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      handler(@CurrentUser(data as any) _user: unknown) {}
    }
    const metadata = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      TestController,
      'handler',
    );
    const entry = Object.values(metadata).find(
      (value: any) => value?.data === data,
    ) as any;

    return entry.factory as (arg: string | undefined, ctx: any) => unknown;
  };

  it('returns a selected field when data is provided', () => {
    const factory = getFactoryFor('id');

    expect(factory('id', makeContext({ id: 'user-1', email: 'a@b.com' }))).toBe(
      'user-1',
    );
  });

  it('returns the whole user when data is missing', () => {
    const factory = getFactoryFor(undefined);
    const user = { id: 'user-1', email: 'a@b.com' };

    expect(factory(undefined, makeContext(user))).toEqual(user);
  });
});
