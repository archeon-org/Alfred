import { applyDecorators } from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { ApiPrivateController } from '../common/decorators/api-controller.decorator';

const notificationIdParam = {
  name: 'id',
  description: 'Notification UUID',
  type: 'string',
  format: 'uuid',
};

export function ApiNotificationControllerDocs(): ClassDecorator {
  return ApiPrivateController('notifications', 'Notification Center');
}

export function ApiListNotificationsDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'List notifications',
      description:
        'Returns paginated notifications for the authenticated user.',
    }),
    ApiOkResponse({
      description: 'Paginated user notifications',
      schema: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                message: { type: 'string' },
                type: { type: 'string', nullable: true },
                isRead: { type: 'boolean' },
                redirectPath: { type: 'string', nullable: true },
                createdAt: { type: 'string', format: 'date-time' },
              },
            },
          },
          meta: { type: 'object' },
          links: { type: 'object' },
        },
      },
    }),
  );
}

export function ApiMarkNotificationReadDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Mark notification as read',
      description: 'Marks a single notification as read.',
    }),
    ApiParam(notificationIdParam),
    ApiOkResponse({ description: 'Notification marked as read' }),
    ApiNotFoundResponse({ description: 'Notification not found' }),
  );
}

export function ApiMarkAllNotificationsReadDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Mark all notifications as read',
      description:
        'Marks all notifications for the authenticated user as read.',
    }),
    ApiOkResponse({ description: 'All notifications marked as read' }),
  );
}

export function ApiDeleteNotificationDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Delete notification',
      description:
        'Deletes one notification belonging to the authenticated user.',
    }),
    ApiParam(notificationIdParam),
    ApiNoContentResponse({ description: 'Notification deleted successfully' }),
    ApiNotFoundResponse({ description: 'Notification not found' }),
  );
}
