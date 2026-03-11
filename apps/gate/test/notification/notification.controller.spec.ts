import { NotificationController } from 'src/notification/notification.controller';

describe('NotificationController', () => {
  const notificationService = {
    getUserNotifications: jest.fn(),
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn(),
    delete: jest.fn(),
  };
  const controller = new NotificationController(notificationService as any);
  const req = { user: { id: 'user-1' } };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists user notifications', async () => {
    const query = { page: 1, limit: 10 };

    await controller.getUserNotifications(req as any, query as any);

    expect(notificationService.getUserNotifications).toHaveBeenCalledWith(
      'user-1',
      query,
    );
  });

  it('marks notification as read', async () => {
    await controller.markAsRead('notif-1');

    expect(notificationService.markAsRead).toHaveBeenCalledWith('notif-1');
  });

  it('marks all notifications as read', async () => {
    await controller.markAllAsRead(req as any);

    expect(notificationService.markAllAsRead).toHaveBeenCalledWith('user-1');
  });

  it('deletes user notification', async () => {
    await controller.deleteNotification('notif-1', req as any);

    expect(notificationService.delete).toHaveBeenCalledWith(
      'notif-1',
      'user-1',
    );
  });
});
