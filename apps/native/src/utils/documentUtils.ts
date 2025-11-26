export const getStatusStyle = (status: string) => {
  switch (status) {
    case "COMPLETED":
      return {
        container: "bg-green-100 dark:bg-green-900/30",
        text: "text-green-700 dark:text-green-400",
        label: "Processed",
        icon: "checkmark-circle",
      };
    case "PROCESSING":
      return {
        container: "bg-blue-100 dark:bg-blue-900/30",
        text: "text-blue-700 dark:text-blue-400",
        label: "Processing",
        icon: "sync",
      };
    case "FAILED":
      return {
        container: "bg-red-100 dark:bg-red-900/30",
        text: "text-red-700 dark:text-red-400",
        label: "Failed",
        icon: "alert-circle",
      };
    default:
      return {
        container: "bg-gray-100 dark:bg-gray-800",
        text: "text-gray-700 dark:text-gray-400",
        label: "Pending",
        icon: "time",
      };
  }
};
