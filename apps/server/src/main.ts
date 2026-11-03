import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "./app";
import { loadConfig } from "./config";
import { connect } from "./db/connect";

const config = loadConfig(process.env);
const here = dirname(fileURLToPath(import.meta.url));
const connection = await connect(config.databaseUrl, join(here, "..", "drizzle"));
const app = await buildApp({ db: connection.db, config });

async function stop(signal: string): Promise<void> {
  app.log.info({ signal }, "shutting down");
  await app.close();
  await connection.close();
}
process.once("SIGINT", () => void stop("SIGINT"));
process.once("SIGTERM", () => void stop("SIGTERM"));

await app.listen({ port: config.port, host: config.host });
