import React from "react";
import TestRenderer from "react-test-renderer";
import AuthLayout from "../../src/app/(auth)/_layout";

describe("app/(auth)/_layout", () => {
  it("declares expected auth screens", () => {
    const tree = TestRenderer.create(<AuthLayout />);
    const screens = tree.root.findAllByType("StackScreen");

    expect(screens.map((screen) => screen.props.name)).toEqual([
      "welcome",
      "login",
      "otp",
    ]);
  });
});
