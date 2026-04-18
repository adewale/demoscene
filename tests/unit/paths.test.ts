import { describe, expect, it } from "vitest";

import { projectJsonPath, projectPath } from "../../src/lib/paths";

describe("project paths", () => {
  it("builds the HTML detail path", () => {
    expect(projectPath("acme", "demo")).toBe("/projects/acme/demo");
  });

  it("builds the JSON detail path", () => {
    expect(projectJsonPath("acme", "demo")).toBe("/projects/acme/demo.json");
  });

  it("encodes dots in path segments to avoid .json route collisions", () => {
    expect(projectPath("acme", "demo.json")).toBe("/projects/acme/demo%2Ejson");
    expect(projectJsonPath("acme", "demo.json")).toBe(
      "/projects/acme/demo%2Ejson.json",
    );
  });
});
