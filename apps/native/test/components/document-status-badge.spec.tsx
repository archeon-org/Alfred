import React from "react";
import TestRenderer from "react-test-renderer";
import { Text } from "react-native";
import { DocumentStatusBadge } from "../../src/components/document/DocumentStatusBadge";

describe("components/DocumentStatusBadge", () => {
  it("maps completed status to processed label", () => {
    const tree = TestRenderer.create(
      <DocumentStatusBadge status="COMPLETED" />,
    );
    expect(tree.root.findByType(Text).props.children).toBe("Processed");
  });

  it("falls back to pending label for unknown statuses", () => {
    const tree = TestRenderer.create(<DocumentStatusBadge status="UNKNOWN" />);
    expect(tree.root.findByType(Text).props.children).toBe("Pending");
  });
});
