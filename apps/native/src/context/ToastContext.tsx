import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { Toast, ToastType } from "../components/common/Toast";
import {
  ConfirmationModal,
  ConfirmationType,
} from "../components/common/ConfirmationModal";

interface ToastState {
  visible: boolean;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ConfirmState {
  visible: boolean;
  type: ConfirmationType;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  onConfirm: () => void;
  isLoading: boolean;
}

interface ToastContextValue {
  // Toast methods
  showToast: (
    type: ToastType,
    title: string,
    message?: string,
    duration?: number,
  ) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;

  // Confirmation methods
  confirm: (options: {
    type?: ConfirmationType;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void | Promise<void>;
  }) => void;
  confirmDelete: (options: {
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
  }) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const initialToastState: ToastState = {
  visible: false,
  type: "info",
  title: "",
  message: undefined,
  duration: 3000,
};

const initialConfirmState: ConfirmState = {
  visible: false,
  type: "danger",
  title: "",
  message: "",
  confirmText: "Confirm",
  cancelText: "Cancel",
  onConfirm: () => {},
  isLoading: false,
};

export const ToastProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [toast, setToast] = useState<ToastState>(initialToastState);
  const [confirmation, setConfirmation] =
    useState<ConfirmState>(initialConfirmState);

  const hideToast = useCallback(() => {
    setToast((prev) => ({ ...prev, visible: false }));
  }, []);

  const showToast = useCallback(
    (type: ToastType, title: string, message?: string, duration = 3000) => {
      setToast({
        visible: true,
        type,
        title,
        message,
        duration,
      });
    },
    [],
  );

  const success = useCallback(
    (title: string, message?: string) => {
      showToast("success", title, message);
    },
    [showToast],
  );

  const error = useCallback(
    (title: string, message?: string) => {
      showToast("error", title, message, 4000);
    },
    [showToast],
  );

  const info = useCallback(
    (title: string, message?: string) => {
      showToast("info", title, message);
    },
    [showToast],
  );

  const warning = useCallback(
    (title: string, message?: string) => {
      showToast("warning", title, message);
    },
    [showToast],
  );

  const hideConfirmation = useCallback(() => {
    setConfirmation((prev) => ({ ...prev, visible: false, isLoading: false }));
  }, []);

  const confirm = useCallback(
    (options: {
      type?: ConfirmationType;
      title: string;
      message: string;
      confirmText?: string;
      cancelText?: string;
      onConfirm: () => void | Promise<void>;
    }) => {
      setConfirmation({
        visible: true,
        type: options.type || "info",
        title: options.title,
        message: options.message,
        confirmText: options.confirmText || "Confirm",
        cancelText: options.cancelText || "Cancel",
        onConfirm: async () => {
          setConfirmation((prev) => ({ ...prev, isLoading: true }));
          try {
            await options.onConfirm();
            hideConfirmation();
          } catch (err) {
            setConfirmation((prev) => ({ ...prev, isLoading: false }));
          }
        },
        isLoading: false,
      });
    },
    [hideConfirmation],
  );

  const confirmDelete = useCallback(
    (options: {
      title: string;
      message: string;
      onConfirm: () => void | Promise<void>;
    }) => {
      confirm({
        type: "danger",
        title: options.title,
        message: options.message,
        confirmText: "Delete",
        cancelText: "Cancel",
        onConfirm: options.onConfirm,
      });
    },
    [confirm],
  );

  return (
    <ToastContext.Provider
      value={{
        showToast,
        success,
        error,
        info,
        warning,
        confirm,
        confirmDelete,
      }}
    >
      {children}
      <Toast
        visible={toast.visible}
        type={toast.type}
        title={toast.title}
        message={toast.message}
        duration={toast.duration}
        onHide={hideToast}
      />
      <ConfirmationModal
        visible={confirmation.visible}
        type={confirmation.type}
        title={confirmation.title}
        message={confirmation.message}
        confirmText={confirmation.confirmText}
        cancelText={confirmation.cancelText}
        onConfirm={confirmation.onConfirm}
        onCancel={hideConfirmation}
        isLoading={confirmation.isLoading}
      />
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};
