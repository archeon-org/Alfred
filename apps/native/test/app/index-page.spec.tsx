import React from "react";
import TestRenderer from "react-test-renderer";
import Index from "../../src/app/index";

describe("app/index", () => {
  it("redirects authenticated entrypoint to app tabs", () => {
    const tree = TestRenderer.create(<Index />);
    const redirect = tree.root.findByType("Redirect");

    expect(redirect.props.href).toBe("/(app)");
  });
});
