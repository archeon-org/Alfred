import React from "react";
import TestRenderer from "react-test-renderer";
import { Text } from "react-native";
import { DocumentsEmptyState } from "../../src/components/document/DocumentsEmptyState";

describe("components/DocumentsEmptyState", () => {
  it("renders document empty-state copy", () => {
    const tree = TestRenderer.create(<DocumentsEmptyState />);
    const content = tree.root
      .findAllByType(Text)
      .map((node) => node.props.children);

    expect(content).toContain("No documents found");
    expect(
      content.some((value) =>
        String(value).includes("Upload or scan a document"),
      ),
    ).toBe(true);
  });
});
