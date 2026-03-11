import React from "react";
import TestRenderer from "react-test-renderer";
import { Text, TextInput } from "react-native";
import { Input } from "../../src/components/Input";

describe("components/Input", () => {
  it("renders label, input props, and error state", () => {
    const tree = TestRenderer.create(
      <Input
        label="Email"
        placeholder="name@example.com"
        error="Email is required"
      />,
    );

    const texts = tree.root.findAllByType(Text);
    expect(texts[0].props.children).toBe("Email");
    expect(texts[1].props.children).toBe("Email is required");

    const input = tree.root.findByType(TextInput);
    expect(input.props.placeholder).toBe("name@example.com");
    expect(input.props.className).toContain("border-red-500");
  });

  it("does not render label/error when not provided", () => {
    const tree = TestRenderer.create(<Input placeholder="Only field" />);

    expect(tree.root.findAllByType(Text)).toHaveLength(0);
    expect(tree.root.findByType(TextInput).props.placeholder).toBe(
      "Only field",
    );
  });
});
