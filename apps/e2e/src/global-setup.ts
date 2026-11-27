import { spawn, type ChildProcess } from "node:child_process";
import {
  ensureS3Buckets,
  s3ConfigFromEnv,
} from "../../../packages/platform/src/storage/s3-storage";
import { setupDatabase } from "../../../scripts/db/setup";

/** Starts the worker and waits until it is looking for jobs; returns what stops it. */
function startWorker(): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const worker = spawn("pnpm", ["--filter", "@app/worker", "start"], {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    const timer = setTimeout(() => reject(new Error("The worker did not start in 60 s")), 60_000);
    let log = "";
    const watch = (chunk: Buffer) => {
      log += chunk.toString();
      if (log.includes("Worker connected")) {
        clearTimeout(timer);
        resolve(worker);
      }
    };
    worker.stdout?.on("data", watch);
    worker.stderr?.on("data", watch);
    worker.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`The worker exited with ${code}:\n${log.slice(-2000)}`));
    });
  });
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  await setupDatabase(process.env.DATABASE_MIGRATOR_URL!);
  await ensureS3Buckets(s3ConfigFromEnv(process.env));
  const worker = await startWorker();
  worker.removeAllListeners("exit");

  return async () => {
    if (worker.pid) process.kill(-worker.pid, "SIGTERM");
  };
}
