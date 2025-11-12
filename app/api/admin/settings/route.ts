import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getSettingValue,
  setSettingValue,
} from "@/lib/settings";

type SettingsPayload = {
  smtpHost?: string | null;
  smtpPort?: string | null;
  smtpUser?: string | null;
  smtpPassword?: string | null;
  smtpFrom?: string | null;
  openrouterApiKey?: string | null;
  openrouterModel?: string | null;
  dadataApiKey?: string | null;
  dadataSecretKey?: string | null;
  onesignalAppId?: string | null;
  onesignalSafariWebId?: string | null;
  onesignalRestApiKey?: string | null;
};

const SETTING_KEYS = {
  smtpHost: "smtp.host" as const,
  smtpPort: "smtp.port" as const,
  smtpUser: "smtp.user" as const,
  smtpPassword: "smtp.password" as const,
  smtpFrom: "smtp.from" as const,
  openrouterApiKey: "openrouter.apiKey" as const,
  openrouterModel: "openrouter.model" as const,
  dadataApiKey: "dadata.apiKey" as const,
  dadataSecretKey: "dadata.secretKey" as const,
  onesignalAppId: "onesignal.appId" as const,
  onesignalSafariWebId: "onesignal.safariWebId" as const,
  onesignalRestApiKey: "onesignal.restApiKey" as const,
};

function ensureSuperAdmin(session: any): NextResponse | null {
  const user = (session as any)?.user;
  if (!user?.id || !user?.role) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  if (user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  return null;
}

function normalizeValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    return String(value ?? "").trim() || null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET() {
  const session = await auth();
  const errorResponse = ensureSuperAdmin(session);
  if (errorResponse) {
    return errorResponse;
  }

  const [smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom, apiKey, model] =
    await Promise.all([
      getSettingValue(SETTING_KEYS.smtpHost),
      getSettingValue(SETTING_KEYS.smtpPort),
      getSettingValue(SETTING_KEYS.smtpUser),
      getSettingValue(SETTING_KEYS.smtpPassword),
      getSettingValue(SETTING_KEYS.smtpFrom),
      getSettingValue(SETTING_KEYS.openrouterApiKey),
      getSettingValue(SETTING_KEYS.openrouterModel),
    ]);

  const [dadataApiKey, dadataSecretKey, onesignalAppId, onesignalSafariWebId, onesignalRestApiKey] =
    await Promise.all([
      getSettingValue(SETTING_KEYS.dadataApiKey),
      getSettingValue(SETTING_KEYS.dadataSecretKey),
      getSettingValue(SETTING_KEYS.onesignalAppId),
      getSettingValue(SETTING_KEYS.onesignalSafariWebId),
      getSettingValue(SETTING_KEYS.onesignalRestApiKey),
    ]);

  return NextResponse.json({
    smtp: {
      host: smtpHost ?? "",
      port: smtpPort ?? "",
      user: smtpUser ?? "",
      password: smtpPassword ?? "",
      from: smtpFrom ?? "",
    },
    openrouter: {
      apiKey: apiKey ?? "",
      model: model ?? "openrouter/auto",
    },
    dadata: {
      apiKey: dadataApiKey ?? "",
      secretKey: dadataSecretKey ?? "",
    },
    onesignal: {
      appId: onesignalAppId ?? "",
      safariWebId: onesignalSafariWebId ?? "",
      restApiKey: onesignalRestApiKey ?? "",
    },
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  const errorResponse = ensureSuperAdmin(session);
  if (errorResponse) {
    return errorResponse;
  }

  let payload: SettingsPayload;

  try {
    payload = (await request.json()) as SettingsPayload;
  } catch (error) {
    console.error("[admin/settings] Невалидный JSON", error);
    return NextResponse.json(
      { error: "Неверный формат данных" },
      { status: 400 },
    );
  }

  const entries: Array<[keyof typeof SETTING_KEYS, string | null]> = [
    ["smtpHost", normalizeValue(payload.smtpHost)],
    ["smtpPort", normalizeValue(payload.smtpPort)],
    ["smtpUser", normalizeValue(payload.smtpUser)],
    ["smtpPassword", normalizeValue(payload.smtpPassword)],
    ["smtpFrom", normalizeValue(payload.smtpFrom)],
    ["openrouterApiKey", normalizeValue(payload.openrouterApiKey)],
    ["openrouterModel", normalizeValue(payload.openrouterModel)],
    ["dadataApiKey", normalizeValue(payload.dadataApiKey)],
    ["dadataSecretKey", normalizeValue(payload.dadataSecretKey)],
    ["onesignalAppId", normalizeValue(payload.onesignalAppId)],
    ["onesignalSafariWebId", normalizeValue(payload.onesignalSafariWebId)],
    ["onesignalRestApiKey", normalizeValue(payload.onesignalRestApiKey)],
  ];

  try {
    await Promise.all(
      entries.map(([key, value]) =>
        setSettingValue(SETTING_KEYS[key], value, session!.user!.id),
      ),
    );
  } catch (error) {
    console.error("[admin/settings] Ошибка сохранения", error);
    return NextResponse.json(
      { error: "Не удалось сохранить настройки" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}

