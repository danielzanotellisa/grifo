import type { CronItem, Task, TaskList } from "graphile-worker";

/**
 * The schedule. Items, not a crontab text: the crontab syntax of Graphile does not accept a dot in
 * a task name, and ours have one (`trash.purge`), so the worker would refuse to start.
 */
export const cronItems: CronItem[] = [
  { task: "trash.purge", match: "0 4 * * *" },
  { task: "storage.integrityCheck", match: "0 5 * * 0" },
  { task: "backup.restoreTest", match: "0 6 1 * *" },
  { task: "auth.expireMail", match: "0 * * * *" },
];

const notImplemented =
  (name: string): Task =>
  async (_payload, helpers) => {
    helpers.logger.warn(`${name}: not implemented yet (see its spec)`);
  };

/** Task names must match `TaskName` in @app/platform (ADR 0029). */
export function createTaskList(tasks: {
  validateDocument: Task;
  deepScan: Task;
  exportRender: Task;
  purge: Task;
  sendEmail: Task;
  expireMail: Task;
}): TaskList {
  return {
    "document.validate": tasks.validateDocument,
    "document.deepScan": tasks.deepScan,
    "export.render": tasks.exportRender,
    "trash.purge": tasks.purge,
    "backup.restoreTest": notImplemented("backup.restoreTest"),
    "storage.integrityCheck": notImplemented("storage.integrityCheck"),
    "auth.sendEmail": tasks.sendEmail,
    "auth.expireMail": tasks.expireMail,
  };
}
