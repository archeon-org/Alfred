import * as crypto from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from 'src/auth/auth.service';

describe('AuthService', () => {
  const userService = {
    findByEmail: jest.fn(),
    createGoogleOAuthUser: jest.fn(),
    updateLastLogin: jest.fn(),
    updateOtp: jest.fn(),
    findByEmailWithOtp: jest.fn(),
    clearOtp: jest.fn(),
  };
  const jwtService = {
    signAsync: jest.fn(),
  };
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'ACCESS_TOKEN_SECRET') return 'secret-key';
      if (key === 'ACCESS_TOKEN_EXPIRATION') return '3600';
      return undefined;
    }),
  };

  const service = new AuthService(
    userService as any,
    jwtService as any,
    configService as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).fetch = jest.fn();
  });

  afterEach(() => {
    delete (global as any).fetch;
    jest.restoreAllMocks();
  });

  it('creates access token with configured secret and expiration', async () => {
    jwtService.signAsync.mockResolvedValue('token-1');

    await expect(
      service.creationAccessToken({ id: 'user-1' } as any),
    ).resolves.toBe('token-1');

    expect(jwtService.signAsync).toHaveBeenCalledWith(
      { sub: 'user-1' },
      {
        secret: 'secret-key',
        expiresIn: 3600,
      },
    );
  });

  it('verifies google token for existing user', async () => {
    const existingUser = { id: 'user-1', isOnboarded: true };
    (global as any).fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ email: 'user@example.com', id: 'google-1' }),
    });
    userService.findByEmail.mockResolvedValue(existingUser);
    userService.updateLastLogin.mockResolvedValue(undefined);
    jwtService.signAsync.mockResolvedValue('jwt-token');

    await expect(
      service.verifyGoogleToken({
        googleAccessToken: 'google-token',
        email: 'user@example.com',
        firstName: 'John',
        lastName: 'Doe',
        picture: 'pic',
      }),
    ).resolves.toEqual({
      accessToken: 'jwt-token',
      isOnboarded: true,
    });

    expect(userService.createGoogleOAuthUser).not.toHaveBeenCalled();
    expect(userService.updateLastLogin).toHaveBeenCalledWith('user-1');
  });

  it('creates user when google user does not exist', async () => {
    (global as any).fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ email: 'user@example.com', id: 'google-2' }),
    });
    userService.findByEmail.mockResolvedValue(null);
    userService.createGoogleOAuthUser.mockResolvedValue({
      id: 'user-2',
      isOnboarded: false,
    });
    userService.updateLastLogin.mockResolvedValue(undefined);
    jwtService.signAsync.mockResolvedValue('jwt-token');

    await expect(
      service.verifyGoogleToken({
        googleAccessToken: 'google-token',
        email: 'user@example.com',
        firstName: 'John',
        lastName: 'Doe',
        picture: 'pic',
      }),
    ).resolves.toEqual({
      accessToken: 'jwt-token',
      isOnboarded: false,
    });

    expect(userService.createGoogleOAuthUser).toHaveBeenCalledWith({
      email: 'user@example.com',
      firstName: 'John',
      lastName: 'Doe',
      profilePicture: 'pic',
      googleId: 'google-2',
    });
  });

  it('throws when google email does not match request email', async () => {
    (global as any).fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ email: 'different@example.com', id: 'google-1' }),
    });

    await expect(
      service.verifyGoogleToken({
        googleAccessToken: 'google-token',
        email: 'user@example.com',
        firstName: 'John',
        lastName: 'Doe',
        picture: 'pic',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('ignores OTP requests for unknown users', async () => {
    userService.findByEmail.mockResolvedValue(null);

    await service.requestOtp({ email: 'missing@example.com' });

    expect(userService.updateOtp).not.toHaveBeenCalled();
  });

  it('stores OTP hash and expiration for known users', async () => {
    userService.findByEmail.mockResolvedValue({ id: 'user-1' });
    userService.updateOtp.mockResolvedValue(undefined);
    jest.spyOn(Math, 'random').mockReturnValue(0);

    await service.requestOtp({ email: 'user@example.com' });

    const expectedHash = crypto
      .createHash('sha256')
      .update('100000')
      .digest('hex');

    expect(userService.updateOtp).toHaveBeenCalledTimes(1);
    expect(userService.updateOtp).toHaveBeenCalledWith(
      'user-1',
      expectedHash,
      expect.any(Date),
    );
  });

  it('rejects OTP verification when user record is missing', async () => {
    userService.findByEmailWithOtp.mockResolvedValue(null);

    await expect(
      service.verifyOtp({ email: 'user@example.com', otp: '123456' }),
    ).rejects.toThrow('Invalid OTP');
  });

  it('rejects OTP verification when OTP is expired', async () => {
    userService.findByEmailWithOtp.mockResolvedValue({
      id: 'user-1',
      otpHash: 'hash',
      otpExpiresAt: new Date(Date.now() - 1_000),
    });

    await expect(
      service.verifyOtp({ email: 'user@example.com', otp: '123456' }),
    ).rejects.toThrow('OTP expired');
  });

  it('rejects OTP verification on hash mismatch', async () => {
    userService.findByEmailWithOtp.mockResolvedValue({
      id: 'user-1',
      otpHash: 'different-hash',
      otpExpiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      service.verifyOtp({ email: 'user@example.com', otp: '123456' }),
    ).rejects.toThrow('Invalid OTP');
  });

  it('verifies OTP and returns access token', async () => {
    const otpHash = crypto.createHash('sha256').update('654321').digest('hex');
    userService.findByEmailWithOtp.mockResolvedValue({
      id: 'user-9',
      otpHash,
      otpExpiresAt: new Date(Date.now() + 60_000),
      isOnboarded: true,
    });
    userService.clearOtp.mockResolvedValue(undefined);
    userService.updateLastLogin.mockResolvedValue(undefined);
    jwtService.signAsync.mockResolvedValue('jwt-otp');

    await expect(
      service.verifyOtp({ email: 'user@example.com', otp: '654321' }),
    ).resolves.toEqual({
      accessToken: 'jwt-otp',
      isOnboarded: true,
    });

    expect(userService.clearOtp).toHaveBeenCalledWith('user-9');
    expect(userService.updateLastLogin).toHaveBeenCalledWith('user-9');
  });
});
