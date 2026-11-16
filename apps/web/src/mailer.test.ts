import { afterEach, describe, expect, it, vi } from "vitest";
import { assertMailerReady } from "./mailer";

afterEach(() => vi.unstubAllEnvs());

describe("assertMailerReady", () => {
  it("refuses to be used in production, where no real sender exists yet", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(() => assertMailerReady()).toThrow(/no email sender/i);
  });

  it("lets development and tests use the logging sender", () => {
    for (const env of ["development", "test"]) {
      vi.stubEnv("NODE_ENV", env);

      expect(() => assertMailerReady()).not.toThrow();
    }
  });
});
