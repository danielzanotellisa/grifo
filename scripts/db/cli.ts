import { runSqlFile, setupDatabase } from "./setup";

const url = process.env.DATABASE_MIGRATOR_URL;
if (!url) {
  console.error("DATABASE_MIGRATOR_URL is not set (see .env.example)");
  process.exit(2);
}

const command = process.argv[2];
if (command === "setup") await setupDatabase(url);
else if (command === "rls") await runSqlFile(url, "rls.sql");
else {
  console.error("usage: cli.ts setup | rls");
  process.exit(2);
}
console.log(`db ${command}: ok`);
