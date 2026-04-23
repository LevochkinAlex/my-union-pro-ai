import { prisma } from "./prisma";

type RunwaySettingKey = "runwayml.apiKey" | "runwayml.apiVersion";

const ENV_FALLBACKS: Record<RunwaySettingKey, string | undefined> = {
  "runwayml.apiKey": process.env.RUNWAYML_API_KEY,
  "runwayml.apiVersion": process.env.RUNWAYML_API_VERSION,
};

async function getSettingValue(key: RunwaySettingKey): Promise<string | null> {
  const setting = await prisma.systemSetting.findUnique({ where: { key } });
  if (setting?.value) return setting.value;
  return ENV_FALLBACKS[key] ?? null;
}

/**
 * Конфиг Runway ML для генерации изображений (ключи в systemSetting + env).
 */
export async function getRunwayMLConfig() {
  const [apiKey, apiVersion] = await Promise.all([
    getSettingValue("runwayml.apiKey"),
    getSettingValue("runwayml.apiVersion"),
  ]);
  return { apiKey: apiKey ?? "", apiVersion: apiVersion ?? "2024-11-06" };
}
