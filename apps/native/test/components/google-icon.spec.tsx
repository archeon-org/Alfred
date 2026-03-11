import React from "react";
import TestRenderer from "react-test-renderer";
import { Image } from "react-native";
import { GoogleIcon } from "../../src/components/icons/GoogleIcon";

describe("components/GoogleIcon", () => {
  it("uses provided size for width and height", () => {
    const tree = TestRenderer.create(<GoogleIcon size={40} />);
    const image = tree.root.findByType(Image);

    expect(image.props.style).toEqual({ width: 40, height: 40 });
    expect(image.props.resizeMode).toBe("contain");
  });
});
