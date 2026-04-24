/**
 * Для cron на VDS: `dotenv/config` по умолчанию читает только `.env`, а прод использует `.env.local`.
 * Импортируйте этим модулем первым во входном скрипте (до любого импорта с Prisma).
 *
 * Корень проекта — родитель каталога `scripts/`, не `process.cwd()` (так надёжнее при ручном запуске).
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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
