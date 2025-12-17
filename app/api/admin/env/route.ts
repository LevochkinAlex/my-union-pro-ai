import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import fs from "fs/promises";
import path from "path";

// Список переменных которые можно редактировать
const EDITABLE_ENV_VARS = [
  "NEXT_PUBLIC_APP_URL",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_FROM",
  "OPENROUTER_API_KEY",
  "RUNWAYML_API_KEY",
  "RUNWAYML_API_VERSION",
  "DADATA_API_KEY",
  "DADATA_SECRET_KEY",
  "FIREBASE_PRIVATE_KEY",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID",
  "NEXT_PUBLIC_FIREBASE_VAPID_PUBLIC_KEY",
  "BEST_BENEFITS_API_URL",
  "BEST_BENEFITS_API_KEY",
  "BEST_BENEFITS_TOKEN",
  "NEXT_PUBLIC_SENTRY_DSN",
  "GRAFANA_URL",
];

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (session?.user?.role !== UserRole.SUPER_ADMIN) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
      });
    }

    // Читаем .env.local
    const envLocalPath = path.join(process.cwd(), ".env.local");
    const envProdPath = path.join(process.cwd(), ".env.prod");

    let envLocal: Record<string, string> = {};
    let envProd: Record<string, string> = {};

    try {
      const localContent = await fs.readFile(envLocalPath, "utf-8");
      envLocal = parseEnvFile(localContent);
    } catch (error) {
      console.warn("[admin/env] .env.local not found");
    }

    try {
      const prodContent = await fs.readFile(envProdPath, "utf-8");
      envProd = parseEnvFile(prodContent);
    } catch (error) {
      console.warn("[admin/env] .env.prod not found");
    }

    // Возвращаем только редактируемые переменные + все переменные для чтения (для мониторинга)
    const result: Record<string, { local?: string; prod?: string }> = {};
    EDITABLE_ENV_VARS.forEach((key) => {
      result[key] = {
        local: envLocal[key],
        prod: envProd[key],
      };
    });

    // Добавляем переменные для мониторинга (только для чтения)
    const monitoringVars = ["NEXT_PUBLIC_SENTRY_DSN", "GRAFANA_URL"];
    monitoringVars.forEach((key) => {
      if (!result[key]) {
        result[key] = {
          local: envLocal[key] || process.env[key],
          prod: envProd[key] || process.env[key],
        };
      }
    });

    return new Response(JSON.stringify(result), { status: 200 });
  } catch (error) {
    console.error("[admin/env] Error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
    });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (session?.user?.role !== UserRole.SUPER_ADMIN) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
      });
    }

    const { env, variables } = await request.json();

    if (!env || !["local", "prod"].includes(env)) {
      return new Response(
        JSON.stringify({ error: "Invalid env parameter (must be 'local' or 'prod')" }),
        { status: 400 }
      );
    }

    const envPath = path.join(process.cwd(), `.env.${env}`);

    // Читаем текущий файл
    let currentContent = "";
    try {
      currentContent = await fs.readFile(envPath, "utf-8");
    } catch (error) {
      // Файл не существует, создадим новый
      currentContent = "";
    }

    const currentEnv = parseEnvFile(currentContent);

    // Обновляем переменные
    Object.keys(variables).forEach((key) => {
      if (EDITABLE_ENV_VARS.includes(key)) {
        currentEnv[key] = variables[key] || "";
      }
    });

    // Формируем новый контент
    const newContent = Object.entries(currentEnv)
      .map(([key, value]) => {
        // Экранируем специальные символы
        const escapedValue = value.replace(/"/g, '\\"');
        return `${key}="${escapedValue}"`;
      })
      .join("\n");

    // Сохраняем файл
    await fs.writeFile(envPath, newContent, "utf-8");

    console.log(`[admin/env] ✅ Updated .env.${env}`);

    return new Response(
      JSON.stringify({ success: true, message: `Updated .env.${env}` }),
      { status: 200 }
    );
  } catch (error) {
    console.error("[admin/env] Error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
    });
  }
}

// Парсинг .env файла
function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();

      // Убираем кавычки если есть
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      // Раскодируем экранированные символы
      value = value.replace(/\\"/g, '"');

      result[key] = value;
    }
  }

  return result;
}

