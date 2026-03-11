import React from "react";

const router = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
};

let segments: string[] = [];
let pathname = "/";
let localSearchParams: Record<string, unknown> = {};

export const __setSegments = (next: string[]) => {
  segments = next;
};

export const __setPathname = (next: string) => {
  pathname = next;
};

export const __setLocalSearchParams = (params: Record<string, unknown>) => {
  localSearchParams = params;
};

export const __getRouter = () => router;

export const __resetRouterMocks = () => {
  router.push.mockReset();
  router.replace.mockReset();
  router.back.mockReset();
  router.canGoBack.mockReset();
  router.canGoBack.mockReturnValue(true);
};

export const useRouter = () => router;
export const useSegments = () => segments as any;
export const usePathname = () => pathname;
export const useLocalSearchParams = () => localSearchParams as any;

export const Redirect = (props: any) => React.createElement("Redirect", props);
export const Slot = (props: any) =>
  React.createElement("Slot", props, props.children);
export const Link = (props: any) =>
  React.createElement("Link", props, props.children);

const StackImpl: any = (props: any) =>
  React.createElement("Stack", props, props.children);
StackImpl.Screen = (props: any) =>
  React.createElement("StackScreen", props, props.children);
export const Stack = StackImpl;

const TabsImpl: any = (props: any) =>
  React.createElement("Tabs", props, props.children);
TabsImpl.Screen = (props: any) =>
  React.createElement("TabsScreen", props, props.children);
export const Tabs = TabsImpl;

export { router };
