import { prisma } from "./prisma";

type SettingKey =
  | "smtp.host"
  | "smtp.port"
  | "smtp.user"
  | "smtp.password"
  | "smtp.from"
  | "openrouter.apiKey"
  | "openrouter.model"
  | "openrouter.embeddingModel"
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
  "openrouter.apiKey": process.env.OPENROUTER_API_KEY,
  "openrouter.model": process.env.OPENROUTER_MODEL,
  "openrouter.embeddingModel": process.env.OPENROUTER_EMBEDDING_MODEL,
  "runwayml.apiKey": process.env.RUNWAYML_API_KEY,
  "runwayml.apiVersion": process.env.RUNWAYML_API_VERSION,
  "dadata.apiKey": process.env.DADATA_API_KEY,
  "dadata.secretKey": process.env.DADATA_SECRET_KEY,
  "onesignal.appId": process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID,
  "onesignal.safariWebId": process.env.NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID,
  "onesignal.restApiKey": process.env.ONESIGNAL_REST_API_KEY,
};

export async function getSettingValue(
  key: SettingKey,
): Promise<string | null> {
  const setting = await prisma.systemSetting.findUnique({
    where: { key },
  });

  if (setting?.value) {
    return setting.value;
  }

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
    create: {
      key,
      value,
      updatedByUserId: userId,
    },
    update: {
      value,
      updatedByUserId: userId,
    },
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

export async function getOpenRouterConfig() {
  const [apiKey, model] = await Promise.all([
    getSettingValue("openrouter.apiKey"),
    getSettingValue("openrouter.model"),
  ]);

  // Используем рабочую модель по умолчанию, если модель не настроена или "openrouter/auto"
  let finalModel = model;
  if (!finalModel || finalModel === "openrouter/auto" || finalModel.trim() === "") {
    finalModel = "openai/gpt-4o-mini"; // Надежная модель по умолчанию
  }

  return {
    apiKey: apiKey ?? "",
    model: finalModel,
  };
}

export async function getOpenRouterEmbeddingConfig() {
  const [apiKey, embeddingModel] = await Promise.all([
    getSettingValue("openrouter.apiKey"),
    getSettingValue("openrouter.embeddingModel"),
  ]);

  return {
    apiKey: apiKey ?? "",
    model: embeddingModel ?? process.env.OPENROUTER_EMBEDDING_MODEL ?? "text-embedding-3-large",
  };
}

export async function getDaDataConfig() {
  const [apiKey, secretKey] = await Promise.all([
    getSettingValue("dadata.apiKey"),
    getSettingValue("dadata.secretKey"),
  ]);

  return {
    apiKey: apiKey ?? "",
    secretKey: secretKey ?? "",
  };
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

  return {
    apiKey: apiKey ?? "",
    apiVersion: apiVersion ?? "2024-11-06",
  };
}

