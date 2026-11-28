import { parseCronItems } from "graphile-worker";
import { describe, expect, it } from "vitest";
import { createTaskList, cronItems } from "./schedule";

const noop = async () => undefined;
const taskList = createTaskList({
  validateDocument: noop,
  deepScan: noop,
  exportRender: noop,
  purge: noop,
  sendEmail: noop,
  expireMail: noop,
});

describe("the worker schedule", () => {
  it("is accepted by Graphile, so the worker can start", () => {
    expect(() => parseCronItems(cronItems)).not.toThrow();
  });

  it("only schedules tasks that exist in the task list", () => {
    const unknown = cronItems.filter((item) => !(item.task in taskList)).map((item) => item.task);

    expect(unknown).toEqual([]);
  });
});
