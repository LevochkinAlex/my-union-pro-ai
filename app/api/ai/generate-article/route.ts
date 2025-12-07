import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOpenRouterConfig } from "@/lib/settings";

/**
 * POST /api/ai/generate-article - Сгенерировать статью с помощью AI
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

    const { topic } = await request.json();

    if (!topic || typeof topic !== "string" || topic.trim().length === 0) {
      return NextResponse.json(
        { error: "Тема не может быть пустой" },
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

    // Формируем промпт для генерации статьи
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

    // Убеждаемся, что используем рабочую модель
    const finalModel = model && model !== "openrouter/auto" ? model : "openai/gpt-4o-mini";

    console.log(`[ai/generate-article] Generating article on topic: "${topic}" using model: ${finalModel}`);

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
        temperature: 0.8,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = "Ошибка при обращении к AI";
      
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error?.message || errorData.error || errorMessage;
        console.error("[ai/generate-article] OpenRouter API error:", errorData);
      } catch {
        console.error("[ai/generate-article] OpenRouter API error (raw):", errorText);
      }
      
      return NextResponse.json(
        { error: errorMessage },
        { status: 500 }
      );
    }

    const data = await response.json();
    const generatedText = data.choices?.[0]?.message?.content;

    if (!generatedText) {
      return NextResponse.json(
        { error: "AI не вернул текст статьи" },
        { status: 500 }
      );
    }

    // Очищаем текст от возможных артефактов
    let finalText = generatedText.trim();
    
    // Удаляем общие вступления типа "Вот статья:", "Конечно!", и т.д.
    finalText = finalText
      .replace(/^(Вот|Конечно|Хорошо|Отлично)[^<]*(<|$)/i, '$2')
      .replace(/^[^<]*статья[^<]*:/i, '')
      .trim();

    // Если AI вернул текст без HTML, оборачиваем в параграфы
    if (!finalText.includes("<") && !finalText.includes(">")) {
      const paragraphs = finalText.split(/\n\n+/).filter(p => p.trim());
      finalText = paragraphs.map(p => `<p>${p.trim()}</p>`).join("");
    }

    console.log(`[ai/generate-article] Successfully generated article (${finalText.length} chars)`);

    return NextResponse.json({
      success: true,
      article: finalText,
    });
  } catch (error: any) {
    console.error("[ai/generate-article] Error:", error);
    const errorMessage = error?.message || "Ошибка при генерации статьи";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

