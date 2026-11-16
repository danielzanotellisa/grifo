import { describe, expect, it } from "vitest";
import { setupDatabase } from "./setup";

describe("setupDatabase", () => {
  it("can run again on a database that is already set up", async () => {
    await expect(setupDatabase(process.env.DATABASE_MIGRATOR_URL!)).resolves.toBeUndefined();
  });
});
