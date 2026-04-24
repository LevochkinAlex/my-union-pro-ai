/**
 * Для cron на VDS: без `dotenv -e .env.local` переменные из `.env.local` не подхватываются.
 * Импортируйте этим модулем первым во входном скрипте (до любого импорта с Prisma).
 *
 * Подхватываем `.env` → `.env.local` → `.env.production` из первого подходящего корня проекта
 * (рядом с `package.json`): путь от этого файла, затем `cwd`, затем `APP_ROOT` / `MYUNION_APP_ROOT`.
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function collectRoots(): string[] {
  const out: string[] = [];
  const push = (p: string | undefined) => {
    const s = (p ?? "").trim();
    if (s && !out.includes(s)) out.push(s);
  };
  push(scriptRoot);
  push(process.cwd());
  push(process.env.APP_ROOT);
  push(process.env.MYUNION_APP_ROOT);
  return out;
}

function isProjectRoot(dir: string): boolean {
  return existsSync(resolve(dir, "package.json"));
}

const chain = [".env", ".env.local", ".env.production"] as const;

for (const root of collectRoots()) {
  if (!isProjectRoot(root)) continue;
  let loadedAny = false;
  for (const name of chain) {
    const path = resolve(root, name);
    if (!existsSync(path)) continue;
    config({ path, override: loadedAny });
    loadedAny = true;
  }
  if (loadedAny && process.env.DATABASE_URL?.trim()) break;
}

if (!process.env.DATABASE_URL?.trim()) {
  const roots = collectRoots();
  const existing = roots
    .filter((r) => isProjectRoot(r))
    .map((r) => chain.map((n) => resolve(r, n)).filter((p) => existsSync(p)))
    .flat();
  console.error(
    "[load-env-local-first] DATABASE_URL не задан после загрузки env.\n" +
      "  Кандидаты корня (с package.json): " +
      roots.filter((r) => isProjectRoot(r)).join(" | ") +
      "\n" +
      "  Найденные файлы env: " +
      (existing.length ? existing.join(", ") : "(нет)") +
      "\n" +
      "  Создайте или поправьте `/opt/my-union-pro/.env.local` (или `.env`) с DATABASE_URL на сервере."
  );
}
