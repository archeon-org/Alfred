import React from "react";
import TestRenderer from "react-test-renderer";
import { Text } from "react-native";
import { ScanEmptyState } from "../../src/components/scan/ScanEmptyState";

describe("components/ScanEmptyState", () => {
  it("renders empty scan guidance text", () => {
    const tree = TestRenderer.create(<ScanEmptyState />);
    const textContent = tree.root
      .findAllByType(Text)
      .map((node) => node.props.children);

    expect(textContent).toContain("Scan Document");
    expect(
      textContent.some((value) =>
        String(value).includes("Take a photo of your document"),
      ),
    ).toBe(true);
  });
});
