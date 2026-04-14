import { describe, expect, it } from "vitest";
import { getActiveRouteName } from "./route-name.js";

describe("getActiveRouteName", () => {
  it("returns leaf route name", () => {
    const state = {
      index: 0,
      routes: [
        {
          name: "Root",
          state: {
            index: 1,
            routes: [{ name: "Home" }, { name: "Profile" }],
          },
        },
      ],
    };
    expect(getActiveRouteName(state)).toBe("Profile");
  });

  it("handles shallow state", () => {
    const state = { index: 0, routes: [{ name: "Only" }] };
    expect(getActiveRouteName(state)).toBe("Only");
  });

  it("returns undefined for invalid input", () => {
    expect(getActiveRouteName(null)).toBeUndefined();
    expect(getActiveRouteName({})).toBeUndefined();
  });
});
