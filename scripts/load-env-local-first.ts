/**
 * Для cron на VDS: `dotenv/config` по умолчанию читает только `.env`, а прод использует `.env.local`.
 * Импортируйте этим модулем первым во входном скрипте (до любого импорта с Prisma).
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const envFile = resolve(root, ".env");
const envLocal = resolve(root, ".env.local");

if (existsSync(envFile)) {
  config({ path: envFile });
}
if (existsSync(envLocal)) {
  config({ path: envLocal, override: true });
}
if (!existsSync(envFile) && !existsSync(envLocal)) {
  config();
}
