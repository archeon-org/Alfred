import React from "react";

export const SafeAreaProvider = (props: any) =>
  React.createElement("SafeAreaProvider", props, props.children);

export const SafeAreaView = (props: any) =>
  React.createElement("SafeAreaView", props, props.children);

export const useSafeAreaInsets = () => ({
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
});
