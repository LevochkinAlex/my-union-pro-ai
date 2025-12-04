import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOpenRouterConfig } from "@/lib/settings";

/**
 * POST /api/ai/improve-text - Улучшить текст с помощью AI
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

    const { text } = await request.json();

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json(
        { error: "Текст не может быть пустым" },
        { status: 400 }
      );
    }

    // Получаем конфигурацию OpenRouter
    const { apiKey, model } = await getOpenRouterConfig();

    if (!apiKey) {
      return NextResponse.json(
        { error: "OpenRouter API не настроен" },
        { status: 500 }
      );
    }

    // Извлекаем текст из HTML (убираем теги для обработки)
    const textContent = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

    if (textContent.length === 0) {
      return NextResponse.json(
        { error: "Текст не содержит содержимого" },
        { status: 400 }
      );
    }

    // Формируем промпт для улучшения текста
    const systemPrompt = `Ты помощник для улучшения текста. Твоя задача - исправить грамматические ошибки, улучшить стиль и структуру текста, сделать его более понятным и профессиональным.

ВАЖНО:
- Сохраняй HTML разметку (теги <p>, <strong>, <em>, <ul>, <ol>, <li>, <a>)
- Не добавляй заголовки (<h1>, <h2>, <h3>)
- Сохраняй структуру списков
- Сохраняй ссылки
- Улучшай только текст, не меняй структуру HTML
- Возвращай только улучшенный HTML без дополнительных объяснений`;

    const userPrompt = `Улучши следующий текст, сохранив HTML разметку:\n\n${textContent}`;

    // Убеждаемся, что используем рабочую модель
    const finalModel = model && model !== "openrouter/auto" ? model : "openai/gpt-4o-mini";

    // Вызываем OpenRouter API
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.NEXTAUTH_URL || "http://localhost:3004",
        "X-Title": "MyUnion Pro",
      },
      body: JSON.stringify({
        model: finalModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = "Ошибка при обращении к AI";
      
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error?.message || errorData.error || errorMessage;
        console.error("[ai/improve-text] OpenRouter API error:", errorData);
      } catch {
        console.error("[ai/improve-text] OpenRouter API error (raw):", errorText);
      }
      
      return NextResponse.json(
        { error: errorMessage },
        { status: 500 }
      );
    }

    const data = await response.json();
    const improvedText = data.choices?.[0]?.message?.content || text;

    // Если AI вернул текст без HTML, оборачиваем в параграфы
    let finalText = improvedText.trim();
    if (!finalText.includes("<") && !finalText.includes(">")) {
      // Если нет HTML тегов, разбиваем на параграфы
      const paragraphs = finalText.split(/\n\n+/).filter(p => p.trim());
      finalText = paragraphs.map(p => `<p>${p.trim()}</p>`).join("");
    }

    return NextResponse.json({
      success: true,
      improvedText: finalText,
    });
  } catch (error: any) {
    console.error("[ai/improve-text] Error:", error);
    const errorMessage = error?.message || "Ошибка при улучшении текста";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

