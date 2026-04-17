import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureSuperAdmin } from "@/lib/admin-auth";
import { YANDEX_MODELS } from "@/app/api/admin/api-providers/route";

/**
 * POST /api/admin/api-providers/sync-yandex-models
 *
 * Проставляет актуальный локальный список моделей Yandex в поле availableModels
 * активного провайдера `yandex`. Если провайдера нет — создаёт его.
 *
 * API Yandex Foundation Models не отдаёт каталог моделей через публичный endpoint,
 * поэтому список хранится в коде и обновляется через этот маршрут при необходимости.
 */
export async function POST() {
  try {
    const { error } = await ensureSuperAdmin();
    if (error) return error;

    const existing = await prisma.apiProvider.findFirst({
      where: { name: "yandex" },
    });

    const availableModels = JSON.stringify(YANDEX_MODELS);

    if (!existing) {
      const created = await prisma.apiProvider.create({
        data: {
          name: "yandex",
          displayName: "Yandex Foundation Models",
          description:
            "YandexGPT — основной ИИ-провайдер платформы (совместим с РФ-блокировками).",
          apiBaseUrl: "https://llm.api.cloud.yandex.net/foundationModels/v1",
          availableModels,
          isActive: true,
          isDefault: true,
        },
      });
      return NextResponse.json({ ok: true, count: YANDEX_MODELS.length, providerId: created.id });
    }

    await prisma.apiProvider.update({
      where: { id: existing.id },
      data: { availableModels },
    });

    return NextResponse.json({
      ok: true,
      count: YANDEX_MODELS.length,
      providerId: existing.id,
    });
  } catch (err) {
    console.error("[sync-yandex-models] error:", err);
    return NextResponse.json(
      { error: "Не удалось обновить список моделей" },
      { status: 500 },
    );
  }
}
