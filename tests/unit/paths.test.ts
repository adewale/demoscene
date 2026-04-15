import { describe, expect, it } from "vitest";

import { projectJsonPath, projectPath } from "../../src/lib/paths";

describe("project paths", () => {
  it("builds the HTML detail path", () => {
    expect(projectPath("acme", "demo")).toBe("/projects/acme/demo");
  });

  it("builds the JSON detail path", () => {
    expect(projectJsonPath("acme", "demo")).toBe("/projects/acme/demo.json");
  });
});
