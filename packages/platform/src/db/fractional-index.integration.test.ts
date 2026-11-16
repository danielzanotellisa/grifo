import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";

const admin = new pg.Pool({ connectionString: process.env.DATABASE_MIGRATOR_URL });

afterAll(() => admin.end());

describe("fractional index columns", () => {
  it("use the C collation so that keys sort as bytes", async () => {
    const { rows } = await admin.query<{ column: string; collation: string | null }>(
      `select table_schema || '.' || table_name || '.' || column_name as "column", collation_name as collation
         from information_schema.columns
        where column_name = 'position' and data_type = 'text'
          and table_schema in ('library', 'annotation', 'outline', 'study', 'export')
        order by 1`,
    );

    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.filter((r) => r.collation !== "C").map((r) => r.column)).toEqual([]);
  });
});
