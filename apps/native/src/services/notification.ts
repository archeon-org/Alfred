import api from "./api";

export interface Notification {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  redirect?: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedNotifications {
  data: Notification[];
  meta: {
    totalItems: number;
    itemCount: number;
    itemsPerPage: number;
    totalPages: number;
    currentPage: number;
  };
}

export const getNotifications = async (
  page: number = 1,
  limit: number = 20,
): Promise<PaginatedNotifications> => {
  const response = await api.get("/notifications", {
    params: { page, limit },
  });
  return response.data;
};

export const markNotificationAsRead = async (id: string): Promise<void> => {
  await api.patch(`/notifications/${id}/read`);
};

export const markAllNotificationsAsRead = async (): Promise<void> => {
  await api.patch("/notifications/read-all");
};

export const deleteNotification = async (id: string): Promise<void> => {
  await api.delete(`/notifications/${id}`);
};
