import { newId } from "@app/platform";
import { describe, expect, it } from "vitest";
import { createAuthDb } from "./db";
import { consumeRateLimit } from "./rate-limit";

const db = createAuthDb(process.env.DATABASE_AUTH_URL!);
const key = () => `account-delete:${newId()}`;
const rule = { max: 5, windowSeconds: 15 * 60 };

describe("consumeRateLimit", () => {
  it("[user/lifecycle#AC-4] allows the first attempts of a window and refuses the next, telling when to retry", async () => {
    const k = key();
    const t0 = new Date("2026-01-01T12:00:00Z");

    const answers = [];
    for (let i = 0; i < 6; i++)
      answers.push(
        await consumeRateLimit(db, { key: k, ...rule, now: new Date(t0.getTime() + i * 1000) }),
      );

    expect(answers.slice(0, 5).every((a) => a.allowed)).toBe(true);
    expect(answers[5]).toEqual({ allowed: false, retryAfterSeconds: 15 * 60 - 5 });
  });

  it("[user/lifecycle#AC-4] starts counting again once the window has passed", async () => {
    const k = key();
    const t0 = new Date("2026-01-01T12:00:00Z");
    for (let i = 0; i < 6; i++) await consumeRateLimit(db, { key: k, ...rule, now: t0 });

    const later = await consumeRateLimit(db, {
      key: k,
      ...rule,
      now: new Date(t0.getTime() + 15 * 60 * 1000 + 1000),
    });

    expect(later.allowed).toBe(true);
  });

  it("[user/lifecycle#AC-4] counts each key on its own", async () => {
    const [a, b] = [key(), key()];
    for (let i = 0; i < 6; i++) await consumeRateLimit(db, { key: a, ...rule });

    expect((await consumeRateLimit(db, { key: a, ...rule })).allowed).toBe(false);
    expect((await consumeRateLimit(db, { key: b, ...rule })).allowed).toBe(true);
  });

  it("[user/lifecycle#AC-4] lets exactly the maximum through under concurrent attempts", async () => {
    const k = key();

    const answers = await Promise.all(
      Array.from({ length: 20 }, () => consumeRateLimit(db, { key: k, ...rule })),
    );

    expect(answers.filter((a) => a.allowed)).toHaveLength(5);
  });
});
