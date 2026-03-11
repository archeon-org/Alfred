import React from "react";
import TestRenderer, { act } from "react-test-renderer";

let latestToastProps: any = null;
let latestConfirmationProps: any = null;

jest.mock("../../src/components/common/Toast", () => {
  const React = require("react");
  return {
    Toast: (props: any) => {
      latestToastProps = props;
      return React.createElement("MockToast", props);
    },
  };
});

jest.mock("../../src/components/common/ConfirmationModal", () => {
  const React = require("react");
  return {
    ConfirmationModal: (props: any) => {
      latestConfirmationProps = props;
      return React.createElement("MockConfirmationModal", props);
    },
  };
});

import { ToastProvider, useToast } from "../../src/context/ToastContext";

describe("context/ToastContext", () => {
  beforeEach(() => {
    latestToastProps = null;
    latestConfirmationProps = null;
  });

  it("throws when useToast is called outside provider", () => {
    const Probe = () => {
      useToast();
      return null;
    };

    expect(() => TestRenderer.create(<Probe />)).toThrow(
      "useToast must be used within a ToastProvider",
    );
  });

  it("shows toast for success/error helpers and hides on dismiss", () => {
    let api: ReturnType<typeof useToast> | null = null;

    const Probe = () => {
      api = useToast();
      return null;
    };

    TestRenderer.create(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    );

    act(() => {
      api?.success("Saved", "All good");
    });

    expect(latestToastProps.visible).toBe(true);
    expect(latestToastProps.type).toBe("success");
    expect(latestToastProps.title).toBe("Saved");
    expect(latestToastProps.message).toBe("All good");
    expect(latestToastProps.duration).toBe(3000);

    act(() => {
      api?.error("Failed", "Try again");
    });

    expect(latestToastProps.type).toBe("error");
    expect(latestToastProps.duration).toBe(4000);

    act(() => {
      latestToastProps.onHide();
    });

    expect(latestToastProps.visible).toBe(false);
  });

  it("runs confirmDelete action and closes modal on success", async () => {
    const onConfirm = jest.fn(async () => {});
    let api: ReturnType<typeof useToast> | null = null;

    const Probe = () => {
      api = useToast();
      return null;
    };

    TestRenderer.create(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    );

    act(() => {
      api?.confirmDelete({
        title: "Delete doc",
        message: "This cannot be undone",
        onConfirm,
      });
    });

    expect(latestConfirmationProps.visible).toBe(true);
    expect(latestConfirmationProps.type).toBe("danger");
    expect(latestConfirmationProps.confirmText).toBe("Delete");

    await act(async () => {
      await latestConfirmationProps.onConfirm();
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(latestConfirmationProps.visible).toBe(false);
  });

  it("keeps confirmation open if confirm callback fails", async () => {
    const onConfirm = jest.fn(async () => {
      throw new Error("boom");
    });
    let api: ReturnType<typeof useToast> | null = null;

    const Probe = () => {
      api = useToast();
      return null;
    };

    TestRenderer.create(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    );

    act(() => {
      api?.confirm({
        type: "warning",
        title: "Confirm",
        message: "Continue?",
        onConfirm,
      });
    });

    await act(async () => {
      await latestConfirmationProps.onConfirm();
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(latestConfirmationProps.visible).toBe(true);
    expect(latestConfirmationProps.isLoading).toBe(false);
  });
});
