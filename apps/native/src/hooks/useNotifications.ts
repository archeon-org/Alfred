import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  PaginatedNotifications,
} from "@/services/notification";

export function useNotifications() {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => getNotifications(1, 20),
  });

  const markAsReadMutation = useMutation({
    mutationFn: markNotificationAsRead,
    onMutate: async (notificationId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["notifications"] });

      // Snapshot the previous value
      const previousNotifications =
        queryClient.getQueryData<PaginatedNotifications>(["notifications"]);

      // Optimistically update to the new value
      if (previousNotifications) {
        queryClient.setQueryData<PaginatedNotifications>(
          ["notifications"],
          (old) => {
            if (!old) return old;
            return {
              ...old,
              data: old.data.map((n) =>
                n.id === notificationId ? { ...n, isRead: true } : n,
              ),
            };
          },
        );
      }

      // Return a context object with the snapshotted value
      return { previousNotifications };
    },
    onError: (err, newTodo, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousNotifications) {
        queryClient.setQueryData(
          ["notifications"],
          context.previousNotifications,
        );
      }
    },
    onSettled: () => {
      // Always refetch after error or success:
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: markAllNotificationsAsRead,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["notifications"] });
      const previousNotifications =
        queryClient.getQueryData<PaginatedNotifications>(["notifications"]);

      if (previousNotifications) {
        queryClient.setQueryData<PaginatedNotifications>(
          ["notifications"],
          (old) => {
            if (!old) return old;
            return {
              ...old,
              data: old.data.map((n) => ({ ...n, isRead: true })),
            };
          },
        );
      }
      return { previousNotifications };
    },
    onError: (err, variables, context) => {
      if (context?.previousNotifications) {
        queryClient.setQueryData(
          ["notifications"],
          context.previousNotifications,
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteNotification,
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey: ["notifications"] });
      const previousNotifications =
        queryClient.getQueryData<PaginatedNotifications>(["notifications"]);

      if (previousNotifications) {
        queryClient.setQueryData<PaginatedNotifications>(
          ["notifications"],
          (old) => {
            if (!old) return old;
            return {
              ...old,
              data: old.data.filter((n) => n.id !== notificationId),
            };
          },
        );
      }
      return { previousNotifications };
    },
    onError: (err, variables, context) => {
      if (context?.previousNotifications) {
        queryClient.setQueryData(
          ["notifications"],
          context.previousNotifications,
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const handleMarkAsRead = (id: string) => {
    markAsReadMutation.mutate(id);
  };

  const handleMarkAllAsRead = () => {
    markAllAsReadMutation.mutate();
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  const unreadCount = data?.data.filter((n) => !n.isRead).length || 0;

  return {
    notifications: data?.data || [],
    isLoading,
    isRefetching,
    refetch,
    handleMarkAsRead,
    handleMarkAllAsRead,
    handleDelete,
    unreadCount,
    isMarkingAsRead: markAsReadMutation.isPending,
    isMarkingAllAsRead: markAllAsReadMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
