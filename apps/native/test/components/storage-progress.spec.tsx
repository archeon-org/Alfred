import React from "react";
import TestRenderer from "react-test-renderer";
import { StorageProgress } from "../../src/components/common/StorageProgress";

describe("components/StorageProgress", () => {
  it("renders default variant with formatted values", () => {
    const tree = TestRenderer.create(
      <StorageProgress used={512 * 1024} limit={1024 * 1024} />,
    );

    const rendered = JSON.stringify(tree.toJSON());

    expect(rendered).toContain("Storage Used");
    expect(rendered).toContain('"50.0"');
    expect(rendered).toContain("% used");
  });

  it("uses warning color near limit for light variant", () => {
    const tree = TestRenderer.create(
      <StorageProgress used={95} limit={100} variant="light" />,
    );

    const progressFill = tree.root.findAll(
      (node) =>
        node.props?.style &&
        typeof node.props.style === "object" &&
        node.props.style.backgroundColor === "#F87171",
    );

    expect(progressFill.length).toBeGreaterThanOrEqual(1);
  });
});
