import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SETTINGS_MAP = [
  { key: "smtp.host", env: "SMTP_HOST" },
  { key: "smtp.port", env: "SMTP_PORT" },
  { key: "smtp.user", env: "SMTP_USER" },
  { key: "smtp.password", env: "SMTP_PASSWORD", altEnv: "SMTP_PASS" },
  { key: "smtp.from", env: "SMTP_FROM" },
  { key: "yandex.apiKey", env: "YANDEX_AI_STUDIO_API_KEY" },
  { key: "yandex.folderId", env: "YANDEX_CLOUD_FOLDER_ID" },
  { key: "yandex.model", env: "YANDEX_DEFAULT_MODEL" },
  { key: "dadata.apiKey", env: "DADATA_API_KEY" },
  { key: "dadata.secretKey", env: "DADATA_SECRET_KEY" },
  { key: "onesignal.appId", env: "NEXT_PUBLIC_ONESIGNAL_APP_ID" },
  { key: "onesignal.safariWebId", env: "NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID" },
  { key: "onesignal.restApiKey", env: "ONESIGNAL_REST_API_KEY" },
];

function pickEnv(entry) {
  const primary = process.env[entry.env];
  if (primary && primary.trim()?.length) {
    return primary.trim();
  }

  if (entry.altEnv) {
    const alt = process.env[entry.altEnv];
    if (alt && alt.trim()?.length) {
      return alt.trim();
    }
  }

  return null;
}

async function seed() {
  console.log("[seed-settings] Старт импорта системных настроек из .env");

  for (const entry of SETTINGS_MAP) {
    const value = pickEnv(entry);

    if (value === null) {
      console.warn(
        `[seed-settings] Пропущено ${entry.key}: переменная ${entry.env}$${
          entry.altEnv ? ` или ${entry.altEnv}` : ""
        } не найдена`,
      );
      continue;
    }

    await prisma.systemSetting.upsert({
      where: { key: entry.key },
      update: {
        value,
        updatedByUserId: null,
      },
      create: {
        key: entry.key,
        value,
      },
    });

    console.log(`[seed-settings] Установлено ${entry.key}`);
  }

  console.log("[seed-settings] Готово");
}

seed()
  .catch((error) => {
    console.error("[seed-settings] Ошибка", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
