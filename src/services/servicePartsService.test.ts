import { describe, expect, it } from "vitest";
import { isServicePartCompatible } from "./servicePartsService";

describe("service and part transmission fitment", () => {
  it.each([
    ["automatic", "automatic", "automatic", true],
    ["automatic", "both", "automatic", true],
    ["automatic", "manual", "automatic", false],
    ["manual", "manual", "manual", true],
    ["manual", "automatic", "manual", false],
    ["both", "automatic", "automatic", true],
    ["both", "manual", "manual", true],
    ["both", "both", "automatic", true],
    ["both", "both", "manual", true],
    ["both", "automatic", "manual", false],
    ["both", "manual", "automatic", false],
  ] as const)(
    "service %s with part %s on a %s motorcycle: %s",
    (serviceCompatibility, partCompatibility, transmission, expected) => {
      expect(
        isServicePartCompatible(
          serviceCompatibility,
          partCompatibility,
          transmission,
        ),
      ).toBe(expected);
    },
  );

  it("does not offer parts until the motorcycle transmission is known", () => {
    expect(isServicePartCompatible("both", "both", "unknown")).toBe(false);
  });
});
