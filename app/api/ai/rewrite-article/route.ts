import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { callYandexChat, isYandexConfigured } from "@/lib/yandex-ai";
import { logAIUsage } from "@/lib/ai-usage";

/**
 * POST /api/ai/rewrite-article — Переписать текст с помощью ИИ (YandexGPT)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { content } = await request.json();
    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json({ error: "Содержимое не может быть пустым" }, { status: 400 });
    }

    if (!isYandexConfigured()) {
      return NextResponse.json({ error: "ИИ не настроен" }, { status: 500 });
    }

    const textContent = content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (textContent.length === 0) {
      return NextResponse.json({ error: "Текст не содержит содержимого" }, { status: 400 });
    }

    const systemPrompt = `Ты помощник для переписывания текста. Твоя задача - полностью переписать текст, улучшив его стиль, грамматику и структуру, но сохранив основную мысль и смысл.

ВАЖНО:
- Сохраняй HTML разметку (теги <p>, <strong>, <em>, <ul>, <ol>, <li>, <a>)
- Не добавляй заголовки (<h1>, <h2>, <h3>)
- Сохраняй структуру списков
- Сохраняй ссылки
- Переписывай текст более выразительно и профессионально
- Возвращай только переписанный HTML без дополнительных объяснений`;

    const userPrompt = `Перепиши следующий текст, улучшив его стиль, грамматику и структуру, но сохранив основную мысль и смысл. Сохрани HTML разметку:\n\n${textContent}`;

    // Рерайт существующего текста — качество лайта хватит.
    const startedAt = Date.now();
    const result = await callYandexChat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { model: "yandexgpt-lite", temperature: 0.7, maxTokens: 2048 },
    );

    void logAIUsage({
      operation: "chat",
      route: "ai/rewrite-article",
      model: "yandexgpt-lite",
      inputTokens: Number(result.usage?.inputTextTokens ?? 0),
      outputTokens: Number(result.usage?.completionTokens ?? 0),
      totalTokens: Number(result.usage?.totalTokens ?? 0),
      userId: session.user.id,
      durationMs: Date.now() - startedAt,
    });

    let finalText = result.text.trim();
    if (!finalText.includes("<") && !finalText.includes(">")) {
      const paragraphs = finalText.split(/\n\n+/).filter((p) => p.trim());
      finalText = paragraphs.map((p) => `<p>${p.trim()}</p>`).join("");
    }

    return NextResponse.json({ success: true, rewritten: finalText });
  } catch (error: unknown) {
    console.error("[ai/rewrite-article] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Ошибка при переписывании текста";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
