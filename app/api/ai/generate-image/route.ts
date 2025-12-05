import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getRunwayMLConfig } from "@/lib/settings";
import { generateImageWithRunwayML, getRunwayMLTaskStatus } from "@/lib/runwayml";

/**
 * POST /api/ai/generate-image - Генерация изображения через RunwayML
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const { prompt, width, height, aspectRatio, seed } = await request.json();

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return NextResponse.json(
        { error: "Промпт не может быть пустым" },
        { status: 400 }
      );
    }

    // Получаем конфигурацию RunwayML
    const config = await getRunwayMLConfig();

    if (!config.apiKey) {
      return NextResponse.json(
        { error: "RunwayML API не настроен" },
        { status: 500 }
      );
    }

    // Запускаем генерацию изображения
    const task = await generateImageWithRunwayML(config, {
      prompt: prompt.trim(),
      width,
      height,
      aspectRatio,
      seed,
    });

    return NextResponse.json({
      success: true,
      taskId: task.id,
      status: task.status,
    });
  } catch (error: any) {
    console.error("[ai/generate-image] Error:", error);
    const errorMessage = error?.message || "Ошибка при генерации изображения";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ai/generate-image?taskId=... - Получение статуса задачи генерации
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const taskId = searchParams.get("taskId");

    if (!taskId) {
      return NextResponse.json(
        { error: "taskId обязателен" },
        { status: 400 }
      );
    }

    // Получаем конфигурацию RunwayML
    const config = await getRunwayMLConfig();

    if (!config.apiKey) {
      return NextResponse.json(
        { error: "RunwayML API не настроен" },
        { status: 500 }
      );
    }

    // Получаем статус задачи
    const task = await getRunwayMLTaskStatus(config, taskId);

    return NextResponse.json({
      success: true,
      task: {
        id: task.id,
        status: task.status,
        result: task.result,
        error: task.error,
      },
    });
  } catch (error: any) {
    console.error("[ai/generate-image] Error:", error);
    const errorMessage = error?.message || "Ошибка при получении статуса задачи";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

