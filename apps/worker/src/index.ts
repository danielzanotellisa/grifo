import { run, type Task, type TaskList } from "graphile-worker";

/**
 * Worker entry point (ADR 0029). Task names must match `TaskName` in @app/platform.
 * Each handler: read in a short withUser transaction -> do the slow work -> write results + recordChange.
 */
const notImplemented =
  (name: string): Task =>
  async (_payload, helpers) => {
    helpers.logger.warn(`${name}: not implemented yet (see its spec)`);
  };

const taskList: TaskList = {
  "document.deepScan": notImplemented("document.deepScan"),
  "export.render": notImplemented("export.render"),
  "trash.purge": notImplemented("trash.purge"),
  "backup.restoreTest": notImplemented("backup.restoreTest"),
  "storage.integrityCheck": notImplemented("storage.integrityCheck"),
};

// minute hour day-of-month month day-of-week task
const crontab = [
  "0 4 * * * trash.purge",
  "0 5 * * 0 storage.integrityCheck",
  "0 6 1 * * backup.restoreTest",
].join("\n");

const runner = await run({
  connectionString: process.env.DATABASE_URL ?? "",
  concurrency: 4,
  taskList,
  crontab,
});

await runner.promise;
