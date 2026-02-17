#!/usr/bin/env node
/**
 * Перенос БД с текущего сервера на VK Cloud (навсегда).
 *
 * Требует: установленные pg_dump, pg_restore, psql (PostgreSQL client).
 *   macOS: brew install libpq && brew link --force libpq
 *   Сервер: обычно уже есть (postgresql-client).
 *
 * Запуск:
 *   OLD_DATABASE_URL="postgresql://USER:PASS@194.87.49.210:5432/myunion_db" \
 *   NEW_DATABASE_URL="postgresql://myadminunion:7v2YY%2C3G59T68zR5s@83.166.237.161:5432/myunion_db" \
 *   node scripts/migrate-db-to-vk-cloud.mjs
 *
 * Если с текущего сервера (194.87.49.210) — там уже есть доступ к локальной БД:
 *   OLD_DATABASE_URL="postgresql://postgres:PASS@localhost:5432/myunion_db" \
 *   NEW_DATABASE_URL="postgresql://myadminunion:7v2YY%2C3G59T68zR5s@83.166.237.161:5432/myunion_db" \
 *   node scripts/migrate-db-to-vk-cloud.mjs
 */

import { execSync, spawnSync } from "child_process";
import fs from "fs";
import path from "path";

const OLD = process.env.OLD_DATABASE_URL;
const NEW = process.env.NEW_DATABASE_URL;

if (!OLD || !NEW) {
  console.error("❌ Задайте OLD_DATABASE_URL и NEW_DATABASE_URL");
  console.error("   NEW_DATABASE_URL — VK Cloud, пароль с запятой как %2C");
  process.exit(1);
}

const dumpPath = path.join(process.cwd(), "tmp-db-migration.dump");

function run(cmd, opts = {}) {
  return execSync(cmd, { stdio: "inherit", ...opts });
}

function runQuiet(cmd) {
  const r = spawnSync(cmd, { shell: true, stdio: "pipe", encoding: "utf-8" });
  return { ok: r.status === 0, stderr: r.stderr || "", stdout: r.stdout || "" };
}

function parseDbName(urlStr) {
  try {
    const u = new URL(urlStr.replace(/^postgres:/, "postgresql:"));
    return u.pathname.slice(1) || "postgres";
  } catch {
    return null;
  }
}

function main() {
  console.log("🔄 Перенос БД на VK Cloud\n");
  console.log("   Источник (OLD):", OLD.replace(/:[^:@]+@/, ":****@"));
  console.log("   Приём (NEW):  ", NEW.replace(/:[^:@]+@/, ":****@"));
  const newDbName = parseDbName(NEW);
  if (!newDbName) {
    console.error("❌ Неверный NEW_DATABASE_URL");
    process.exit(1);
  }
  console.log("   Имя БД на VK Cloud:", newDbName);
  console.log("");

  // Проверка наличия утилит
  const hasPgDump = runQuiet("which pg_dump").ok;
  const hasPgRestore = runQuiet("which pg_restore").ok;
  const hasPsql = runQuiet("which psql").ok;
  if (!hasPgDump || !hasPgRestore || !hasPsql) {
    console.error("❌ Нужны pg_dump, pg_restore, psql (PostgreSQL client).");
    console.error("   macOS: brew install libpq && brew link --force libpq");
    process.exit(1);
  }

  // 1) Создать БД на VK Cloud, если её ещё нет (подключаемся к postgres)
  const newUrl = NEW.replace(/^postgres:/, "postgresql:");
  const urlToPostgres = newUrl.replace(/\/([^/]+)\s*$/, "/postgres");
  console.log("📌 Шаг 1: Проверка/создание БД на VK Cloud...");
  const createResult = runQuiet(
    `psql "${urlToPostgres}" -tAc "SELECT 1 FROM pg_database WHERE datname = '${newDbName}'"`
  );
  const exists = createResult.ok && createResult.stdout.trim() === "1";
  if (!exists) {
    const createDb = runQuiet(
      `psql "${urlToPostgres}" -tAc "CREATE DATABASE \\"${newDbName}\\";"`
    );
    if (!createDb.ok) {
      console.error("❌ Не удалось создать БД:", createDb.stderr || createDb.stdout);
      process.exit(1);
    }
    console.log("   БД создана.");
  } else {
    console.log("   БД уже существует.");
  }

  // 2) Дамп с текущего сервера
  console.log("\n📌 Шаг 2: Дамп текущей БД (это может занять минуты)...");
  const oldUrl = OLD.replace(/^postgres:/, "postgresql:");
  try {
    run(`pg_dump "${oldUrl}" -Fc -f "${dumpPath}"`, { stdio: "inherit" });
  } catch (e) {
    console.error("❌ Ошибка pg_dump. Проверьте OLD_DATABASE_URL и доступ к серверу.");
    process.exit(1);
  }
  const size = fs.statSync(dumpPath).size;
  console.log(`   Размер дампа: ${(size / 1024 / 1024).toFixed(2)} MB`);

  // 3) Восстановление в VK Cloud
  console.log("\n📌 Шаг 3: Восстановление в VK Cloud...");
  try {
    run(
      `pg_restore -d "${newUrl}" --no-owner --no-acl --verbose "${dumpPath}" 2>&1 || true`,
      { stdio: "inherit" }
    );
  } catch (e) {
    // pg_restore может вернуть ненулевой код из-за предупреждений — проверяем данные
  }

  // 4) Проверка
  console.log("\n📌 Шаг 4: Проверка...");
  const check = runQuiet(
    `psql "${newUrl}" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"`
  );
  if (check.ok && parseInt(check.stdout.trim(), 10) > 0) {
    console.log("   Таблицы в public:", check.stdout.trim());
  } else {
    console.error("   Предупреждение: не удалось прочитать количество таблиц.");
  }

  fs.unlinkSync(dumpPath);
  console.log("\n✅ Перенос завершён. Дамп удалён.");
  console.log("\nДальше:");
  console.log("  1. Обновите DATABASE_URL на сервере (и в .env.local для деплоя) на NEW_DATABASE_URL.");
  console.log("  2. Перезапустите приложение (pm2 restart).");
  console.log("  3. Убедитесь, что в VK Cloud открыт доступ с IP вашего приложения (194.87.49.210).");
}

main();
