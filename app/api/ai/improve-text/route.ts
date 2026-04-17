import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { callYandexChat, isYandexConfigured } from "@/lib/yandex-ai";
import { logAIUsage } from "@/lib/ai-usage";

/**
 * POST /api/ai/improve-text — Улучшить текст с помощью ИИ (YandexGPT)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { text } = await request.json();
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json({ error: "Текст не может быть пустым" }, { status: 400 });
    }

    if (!isYandexConfigured()) {
      return NextResponse.json({ error: "ИИ не настроен" }, { status: 500 });
    }

    const textContent = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (textContent.length === 0) {
      return NextResponse.json({ error: "Текст не содержит содержимого" }, { status: 400 });
    }

    const systemPrompt = `Ты помощник для улучшения текста. Твоя задача - исправить грамматические ошибки, улучшить стиль и структуру текста, сделать его более понятным и профессиональным.

ВАЖНО:
- Сохраняй HTML разметку (теги <p>, <strong>, <em>, <ul>, <ol>, <li>, <a>)
- Не добавляй заголовки (<h1>, <h2>, <h3>)
- Сохраняй структуру списков
- Сохраняй ссылки
- Улучшай только текст, не меняй структуру HTML
- Возвращай только улучшенный HTML без дополнительных объяснений`;

    const userPrompt = `Улучши следующий текст, сохранив HTML разметку:\n\n${textContent}`;

    // Улучшение текста — правка грамматики/стиля. Лайт справляется,
    // Pro здесь избыточен и дороже в 6 раз.
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
      route: "ai/improve-text",
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

    return NextResponse.json({ success: true, improvedText: finalText });
  } catch (error: unknown) {
    console.error("[ai/improve-text] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Ошибка при улучшении текста";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
