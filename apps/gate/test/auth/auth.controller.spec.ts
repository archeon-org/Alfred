import { AuthController } from 'src/auth/auth.controller';

describe('AuthController', () => {
  const authService = {
    verifyGoogleToken: jest.fn(),
    requestOtp: jest.fn(),
    verifyOtp: jest.fn(),
  };
  const subscriptionService = {
    getSubscriptionStatus: jest.fn(),
  };

  const controller = new AuthController(
    authService as any,
    subscriptionService as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns profile with subscription data', async () => {
    const user = { id: 'user-1', email: 'user@example.com' };
    const subscription = { tier: 'FREE' };
    subscriptionService.getSubscriptionStatus.mockResolvedValue(subscription);

    const result = await controller.getProfile({ user } as any);

    expect(subscriptionService.getSubscriptionStatus).toHaveBeenCalledWith(
      user.id,
    );
    expect(result).toEqual({
      ...user,
      subscription,
    });
  });

  it('delegates google token verification', async () => {
    const dto = {
      googleAccessToken: 'token',
      email: 'user@example.com',
      firstName: 'John',
      lastName: 'Doe',
      picture: 'pic',
    };
    const expected = { accessToken: 'jwt', isOnboarded: true };
    authService.verifyGoogleToken.mockResolvedValue(expected);

    await expect(controller.verifyGoogleToken(dto as any)).resolves.toEqual(
      expected,
    );
    expect(authService.verifyGoogleToken).toHaveBeenCalledWith(dto);
  });

  it('delegates OTP request', async () => {
    const dto = { email: 'user@example.com' };
    authService.requestOtp.mockResolvedValue(undefined);

    await controller.requestOtp(dto as any);

    expect(authService.requestOtp).toHaveBeenCalledWith(dto);
  });

  it('delegates OTP verification', async () => {
    const dto = { email: 'user@example.com', otp: '123456' };
    const expected = { accessToken: 'jwt', isOnboarded: false };
    authService.verifyOtp.mockResolvedValue(expected);

    await expect(controller.verifyOtp(dto as any)).resolves.toEqual(expected);
    expect(authService.verifyOtp).toHaveBeenCalledWith(dto);
  });
});
