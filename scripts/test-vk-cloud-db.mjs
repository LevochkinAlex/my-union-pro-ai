#!/usr/bin/env node
/**
 * Проверка подключения к PostgreSQL на VK Cloud.
 *
 * Запуск (подставьте имя БД — postgres или созданную в панели VK, например myunion_db):
 *   npx prisma db execute --url "postgresql://myadminunion:7v2YY%2C3G59T68zR5s@83.166.237.161:5432/postgres" --stdin <<< "SELECT 1"
 * Или этот скрипт (проверяет подключение к БД postgres):
 *   node scripts/test-vk-cloud-db.mjs
 *
 * В пароле запятая в URL обязательно как %2C.
 */

import { execSync } from "child_process";

const url =
  process.env.DATABASE_URL_VK ||
  process.env.DATABASE_URL;
if (!url || !url.includes("83.166.237.161")) {
  console.error("Задайте URL VK Cloud: DATABASE_URL_VK=\"postgresql://myadminunion:PASSWORD@83.166.237.161:5432/ИМЯ_БД\"");
  console.error("В пароле запятую кодируйте как %2C.");
  process.exit(1);
}

const dbName = new URL(url).pathname.slice(1) || "postgres";

console.log("🔌 Проверка подключения к VK Cloud PostgreSQL...");
console.log("   Хост: 83.166.237.161:5432");
console.log("   Пользователь: myadminunion");
console.log("   БД:", dbName);
console.log("");

try {
  execSync(`npx prisma db execute --url "${url}" --stdin`, {
    input: "SELECT version();",
    stdio: ["pipe", "inherit", "inherit"],
  });
  console.log("\n✅ Подключение установлено. Сервер VK Cloud доступен.");
} catch (e) {
  console.error("\n❌ Ошибка подключения. Проверьте:");
  console.error("   - хост 83.166.237.161 и порт 5432 доступны с вашей сети");
  console.error("   - пароль в URL с запятой как %2C: 7v2YY%2C3G59T68zR5s");
  process.exit(1);
}
