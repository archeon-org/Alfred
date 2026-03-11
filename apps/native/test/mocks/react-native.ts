import React from "react";

type ColorSchemeName = "light" | "dark" | null;
export type AppStateStatus = "active" | "background" | "inactive";

const createComponent = (name: string) => {
  const Component = React.forwardRef<any, any>(({ children, ...props }, ref) =>
    React.createElement(name, { ...props, ref }, children),
  );
  Component.displayName = name;
  return Component;
};

let colorScheme: ColorSchemeName = "light";
export const __setColorScheme = (next: ColorSchemeName) => {
  colorScheme = next;
};

export const useColorScheme = () => colorScheme;

export const Platform = {
  OS: "ios",
  Version: "17.0",
  select: (options: Record<string, any>) =>
    options[Platform.OS] ?? options.default,
};

export const __setPlatformOS = (os: "ios" | "android" | "web") => {
  Platform.OS = os;
};

let appState: AppStateStatus = "active";
const appStateListeners = new Set<(state: AppStateStatus) => void>();

export const AppState = {
  get currentState() {
    return appState;
  },
  set currentState(value: AppStateStatus) {
    appState = value;
  },
  addEventListener: (
    _type: "change",
    handler: (state: AppStateStatus) => void,
  ) => {
    appStateListeners.add(handler);
    return {
      remove: () => {
        appStateListeners.delete(handler);
      },
    };
  },
};

export const __emitAppStateChange = (next: AppStateStatus) => {
  appState = next;
  appStateListeners.forEach((handler) => handler(next));
};

class AnimatedValue {
  private value: number;

  constructor(initialValue: number) {
    this.value = initialValue;
  }

  setValue(next: number) {
    this.value = next;
  }

  __getValue() {
    return this.value;
  }
}

const createAnimation = (run?: () => void) => ({
  start: (callback?: (result: { finished: boolean }) => void) => {
    run?.();
    callback?.({ finished: true });
  },
  stop: () => {},
});

export const Animated = {
  Value: AnimatedValue,
  View: createComponent("AnimatedView"),
  timing: (value: AnimatedValue, config: { toValue?: number }) =>
    createAnimation(() => {
      if (typeof config?.toValue === "number") {
        value.setValue(config.toValue);
      }
    }),
  spring: (value: AnimatedValue, config: { toValue?: number }) =>
    createAnimation(() => {
      if (typeof config?.toValue === "number") {
        value.setValue(config.toValue);
      }
    }),
  sequence: (
    animations: Array<{ start: (cb?: any) => void; stop: () => void }>,
  ) =>
    createAnimation(() => {
      animations.forEach((animation) => animation.start());
    }),
  parallel: (
    animations: Array<{ start: (cb?: any) => void; stop: () => void }>,
  ) =>
    createAnimation(() => {
      animations.forEach((animation) => animation.start());
    }),
  loop: (animation: { start: (cb?: any) => void; stop: () => void }) =>
    createAnimation(() => {
      animation.start();
    }),
  createAnimatedComponent: (Component: any) => Component,
};

export const StyleSheet = {
  create: <T extends Record<string, unknown>>(styles: T) => styles,
  flatten: <T>(style: T) => style,
};

export const Alert = {
  alert: jest.fn(),
};

export const Keyboard = {
  dismiss: jest.fn(),
};

export const Dimensions = {
  get: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 2 })),
};

export const Linking = {
  openURL: jest.fn(async () => true),
};

export const Appearance = {
  getColorScheme: () => colorScheme,
  addChangeListener: jest.fn(() => ({ remove: jest.fn() })),
};

export const useWindowDimensions = () => ({
  width: 390,
  height: 844,
  scale: 3,
  fontScale: 2,
});

export const View = createComponent("View");
export const Text = createComponent("Text");
export const ScrollView = createComponent("ScrollView");
export const TouchableOpacity = createComponent("TouchableOpacity");
export const Pressable = createComponent("Pressable");
export const TextInput = createComponent("TextInput");
export const Image = createComponent("Image");
export const ActivityIndicator = createComponent("ActivityIndicator");
export const Modal = createComponent("Modal");
export const PressableOpacity = createComponent("PressableOpacity");
export const RefreshControl = createComponent("RefreshControl");
export const FlatList = createComponent("FlatList");
export const SectionList = createComponent("SectionList");
export const KeyboardAvoidingView = createComponent("KeyboardAvoidingView");
export const StatusBar = createComponent("StatusBar");
export const Switch = createComponent("Switch");

const ReactNative = {
  Alert,
  Animated,
  AppState,
  Appearance,
  Dimensions,
  Keyboard,
  Linking,
  Platform,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StatusBar,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
  useWindowDimensions,
};

export default ReactNative;
