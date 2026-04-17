import { prisma } from "./prisma";

type SettingKey =
  | "smtp.host"
  | "smtp.port"
  | "smtp.user"
  | "smtp.password"
  | "smtp.from"
  | "yandex.apiKey"
  | "yandex.folderId"
  | "yandex.model"
  | "runwayml.apiKey"
  | "runwayml.apiVersion"
  | "dadata.apiKey"
  | "dadata.secretKey"
  | "onesignal.appId"
  | "onesignal.safariWebId"
  | "onesignal.restApiKey";

const ENV_FALLBACKS: Record<SettingKey, string | undefined> = {
  "smtp.host": process.env.SMTP_HOST,
  "smtp.port": process.env.SMTP_PORT,
  "smtp.user": process.env.SMTP_USER,
  "smtp.password": process.env.SMTP_PASS ?? process.env.SMTP_PASSWORD,
  "smtp.from": process.env.SMTP_FROM,
  "yandex.apiKey": process.env.YANDEX_AI_STUDIO_API_KEY,
  "yandex.folderId": process.env.YANDEX_CLOUD_FOLDER_ID,
  "yandex.model": process.env.YANDEX_DEFAULT_MODEL,
  "runwayml.apiKey": process.env.RUNWAYML_API_KEY,
  "runwayml.apiVersion": process.env.RUNWAYML_API_VERSION,
  "dadata.apiKey": process.env.DADATA_API_KEY,
  "dadata.secretKey": process.env.DADATA_SECRET_KEY,
  "onesignal.appId": process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID,
  "onesignal.safariWebId": process.env.NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID,
  "onesignal.restApiKey": process.env.ONESIGNAL_REST_API_KEY,
};

export async function getSettingValue(key: SettingKey): Promise<string | null> {
  const setting = await prisma.systemSetting.findUnique({ where: { key } });
  if (setting?.value) return setting.value;
  const fallback = ENV_FALLBACKS[key];
  return fallback ?? null;
}

export async function setSettingValue(
  key: SettingKey,
  value: string | null,
  userId?: string,
) {
  await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value, updatedByUserId: userId },
    update: { value, updatedByUserId: userId },
  });
}

export async function getSmtpConfig() {
  const [host, port, user, password, from] = await Promise.all([
    getSettingValue("smtp.host"),
    getSettingValue("smtp.port"),
    getSettingValue("smtp.user"),
    getSettingValue("smtp.password"),
    getSettingValue("smtp.from"),
  ]);
  return {
    host: host ?? "",
    port: port ?? "",
    user: user ?? "",
    pass: password ?? "",
    from: from ?? "",
  };
}

/**
 * Конфиг Yandex AI для чатов и генерации текстов.
 * Если model не указана — используется `yandexgpt` (флагман).
 */
export async function getYandexAIConfig() {
  const [apiKey, folderId, model] = await Promise.all([
    getSettingValue("yandex.apiKey"),
    getSettingValue("yandex.folderId"),
    getSettingValue("yandex.model"),
  ]);
  return {
    apiKey: apiKey ?? "",
    folderId: folderId ?? "",
    model: model && model.trim() ? model : "yandexgpt",
  };
}

export async function getDaDataConfig() {
  const [apiKey, secretKey] = await Promise.all([
    getSettingValue("dadata.apiKey"),
    getSettingValue("dadata.secretKey"),
  ]);
  return { apiKey: apiKey ?? "", secretKey: secretKey ?? "" };
}

export async function getOneSignalConfig() {
  const [appId, safariWebId, restApiKey] = await Promise.all([
    getSettingValue("onesignal.appId"),
    getSettingValue("onesignal.safariWebId"),
    getSettingValue("onesignal.restApiKey"),
  ]);
  return {
    appId: appId ?? "",
    safariWebId: safariWebId ?? "",
    restApiKey: restApiKey ?? "",
  };
}

export async function getRunwayMLConfig() {
  const [apiKey, apiVersion] = await Promise.all([
    getSettingValue("runwayml.apiKey"),
    getSettingValue("runwayml.apiVersion"),
  ]);
  return { apiKey: apiKey ?? "", apiVersion: apiVersion ?? "2024-11-06" };
}
