import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { callYandexChat, isYandexConfigured } from "@/lib/yandex-ai";
import { logAIUsage } from "@/lib/ai-usage";

/**
 * POST /api/ai/generate-article — Сгенерировать статью с помощью ИИ (YandexGPT)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { topic } = await request.json();
    if (!topic || typeof topic !== "string" || topic.trim().length === 0) {
      return NextResponse.json({ error: "Тема не может быть пустой" }, { status: 400 });
    }

    if (!isYandexConfigured()) {
      return NextResponse.json({ error: "ИИ не настроен" }, { status: 500 });
    }

    const systemPrompt = `Ты - профессиональный копирайтер и контент-менеджер. Твоя задача - написать качественную, информативную и увлекательную статью по заданной теме.

ТРЕБОВАНИЯ К СТАТЬЕ:
1. Статья должна быть структурированной и хорошо организованной
2. Используй HTML разметку для форматирования:
   - <p> для параграфов
   - <strong> для выделения важного
   - <em> для акцентов
   - <ul> и <li> для списков
3. НЕ используй заголовки (<h1>, <h2>, <h3>) - они будут добавлены пользователем
4. Статья должна быть от 300 до 800 слов
5. Пиши на русском языке
6. Стиль - профессиональный, но доступный
7. Добавь интересные факты, если уместно
8. Заверши статью кратким выводом или призывом к действию

ВАЖНО: Возвращай ТОЛЬКО текст статьи в HTML формате, без дополнительных пояснений, заголовков типа "Вот статья:" и т.д.`;

    const userPrompt = `Напиши подробную и интересную статью на тему: "${topic.trim()}"`;

    console.log(`[ai/generate-article] Generating article on topic: "${topic}"`);

    const startedAt = Date.now();
    const result = await callYandexChat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { model: "yandexgpt", temperature: 0.8, maxTokens: 4096 },
    );

    void logAIUsage({
      operation: "chat",
      route: "ai/generate-article",
      model: "yandexgpt",
      inputTokens: Number(result.usage?.inputTextTokens ?? 0),
      outputTokens: Number(result.usage?.completionTokens ?? 0),
      totalTokens: Number(result.usage?.totalTokens ?? 0),
      userId: session.user.id,
      durationMs: Date.now() - startedAt,
    });

    let finalText = result.text.trim();
    finalText = finalText
      .replace(/^(Вот|Конечно|Хорошо|Отлично)[^<]*(<|$)/i, "$2")
      .replace(/^[^<]*статья[^<]*:/i, "")
      .trim();

    if (!finalText.includes("<") && !finalText.includes(">")) {
      const paragraphs = finalText.split(/\n\n+/).filter((p) => p.trim());
      finalText = paragraphs.map((p) => `<p>${p.trim()}</p>`).join("");
    }

    console.log(`[ai/generate-article] ✅ Article (${finalText.length} chars)`);

    return NextResponse.json({ success: true, article: finalText });
  } catch (error: unknown) {
    console.error("[ai/generate-article] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Ошибка при генерации статьи";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
