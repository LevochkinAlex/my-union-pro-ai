#!/usr/bin/env node
/**
 * Регистрация Webhook для бота MAX.
 * В кабинете business.max.ru нет поля для URL webhook — его задают через API.
 *
 * Проще всего (токен из .env):
 *   node scripts/register-max-webhook.mjs
 * Или: pnpm dotenv -e .env -- node scripts/register-max-webhook.mjs
 *
 * Документация: https://dev.max.ru/docs-api/methods/POST/subscriptions
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Подгружаем .env из корня (локально и на проде: .env, .env.local, .env.production)
function loadEnv() {
  const envFiles = [".env", ".env.local", ".env.production", ".env.production.local"];
  for (const name of envFiles) {
    try {
      const path = join(root, name);
      const content = readFileSync(path, "utf8");
      for (const line of content.split("\n")) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
      }
    } catch (_) {}
  }
}
loadEnv();

const MAX_BOT_TOKEN = process.env.MAX_BOT_TOKEN?.trim();
const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace?.(/\/$/, "");
const WEBHOOK_URL =
  process.env.WEBHOOK_URL ||
  (appUrl ? `${appUrl}/api/max/webhook` : null) ||
  "https://myunion.pro/api/max/webhook";

if (!MAX_BOT_TOKEN) {
  console.error("Токен не найден. Добавьте MAX_BOT_TOKEN в .env или запустите:");
  console.error("  MAX_BOT_TOKEN=ваш_токен node scripts/register-max-webhook.mjs");
  process.exit(1);
}

async function register() {
  const url = "https://platform-api.max.ru/subscriptions";
  const body = {
    url: WEBHOOK_URL,
    update_types: ["message_created", "bot_started"],
  };

  console.log("Регистрация webhook:", WEBHOOK_URL);

  const authHeader = MAX_BOT_TOKEN.startsWith("Bearer ") ? MAX_BOT_TOKEN : `Bearer ${MAX_BOT_TOKEN}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error("Ошибка:", res.status, data);
    process.exit(1);
  }

  console.log("Ответ:", data);
  if (data.success !== false) {
    console.log("Webhook зарегистрирован. Проверка: GET", url);
  }
}

register();
