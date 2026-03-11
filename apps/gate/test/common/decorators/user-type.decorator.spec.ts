import 'reflect-metadata';
import { UserType } from '@archeon-org/types';
import {
  AuthorizedUser,
  USER_TYPE_KEY,
} from 'src/common/decorators/user-type.decorator';

describe('AuthorizedUser decorator', () => {
  it('stores allowed roles metadata', () => {
    class TestController {
      @AuthorizedUser(UserType.ADMIN, UserType.USER)
      handler() {}
    }

    expect(
      Reflect.getMetadata(USER_TYPE_KEY, TestController.prototype.handler),
    ).toEqual([UserType.ADMIN, UserType.USER]);
  });
});
