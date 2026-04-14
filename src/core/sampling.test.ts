import { describe, expect, it, vi } from "vitest";
import { shouldSample } from "./sampling.js";

describe("shouldSample", () => {
  it("always true when rate >= 1", () => {
    expect(shouldSample(1)).toBe(true);
    expect(shouldSample(2)).toBe(true);
  });

  it("always false when rate <= 0", () => {
    expect(shouldSample(0)).toBe(false);
    expect(shouldSample(-1)).toBe(false);
  });

  it("respects random for mid rates", () => {
    const spy = vi.spyOn(Math, "random").mockReturnValue(0.1);
    expect(shouldSample(0.5)).toBe(true);
    spy.mockReturnValue(0.9);
    expect(shouldSample(0.5)).toBe(false);
    spy.mockRestore();
  });
});
