import type { Task, TaskList } from "graphile-worker";

// minute hour day-of-month month day-of-week task
export const crontab = [
  "0 4 * * * trash.purge",
  "0 5 * * 0 storage.integrityCheck",
  "0 6 1 * * backup.restoreTest",
  "0 * * * * auth.expireMail",
].join("\n");

const notImplemented =
  (name: string): Task =>
  async (_payload, helpers) => {
    helpers.logger.warn(`${name}: not implemented yet (see its spec)`);
  };

/** Task names must match `TaskName` in @app/platform (ADR 0029). */
export function createTaskList(tasks: {
  validateDocument: Task;
  deepScan: Task;
  purge: Task;
  sendEmail: Task;
  expireMail: Task;
}): TaskList {
  return {
    "document.validate": tasks.validateDocument,
    "document.deepScan": tasks.deepScan,
    "export.render": notImplemented("export.render"),
    "trash.purge": tasks.purge,
    "backup.restoreTest": notImplemented("backup.restoreTest"),
    "storage.integrityCheck": notImplemented("storage.integrityCheck"),
    "auth.sendEmail": tasks.sendEmail,
    "auth.expireMail": tasks.expireMail,
  };
}
