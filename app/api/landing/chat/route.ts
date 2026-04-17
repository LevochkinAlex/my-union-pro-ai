import { NextResponse } from "next/server";
import { callYandexChat, isYandexConfigured } from "@/lib/yandex-ai";
import { logAIUsage } from "@/lib/ai-usage";

const SYSTEM_PROMPT = `Ты AI-ассистент платформы MyUnion Pro. Отвечай кратко и по делу.

О платформе:
- MyUnion Pro - современная платформа для автоматизации профсоюзной деятельности
- AI-чат обрабатывает до 80% обращений автоматически
- Автоматическая генерация документов (заявления, справки, формы)
- База членов с 50+ полями профиля
- Интеграция с DaData для проверки организаций
- Push, Email, Telegram уведомления
- 2FA, ролевой доступ, 6 уровней прав

Тарифы:
- От 45₽/пользователь/месяц (при 50 пользователях)
- До 30₽/пользователь/месяц (при 3000+ пользователей)
- Скидка 20% при оплате за год
- Скидка 5-10% для региональных и федеральных организаций

Контакты:
- Email: hello@myunion.pro
- Telegram: @myunion_pro
- Офис: Москва, Россия

Отвечай на русском языке. Будь дружелюбным и профессиональным.`;

/**
 * Гостевой лендинговый чат. Использует YandexGPT (RU совместимо).
 * Формат ответа сохранён как SSE (`0:"chunk"\n`) — фронт не нужно трогать.
 * Стриминг пока не включён: выдаём ответ одним чанком, этого достаточно
 * для коротких маркетинговых ответов и предсказуемо работает за любым прокси.
 */
export async function POST(req: Request) {
  try {
    const { messages } = (await req.json()) as {
      messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
    };

    if (!isYandexConfigured()) {
      return NextResponse.json({ error: "ИИ временно недоступен" }, { status: 503 });
    }

    const startedAt = Date.now();
    const result = await callYandexChat(
      [{ role: "system", content: SYSTEM_PROMPT }, ...(messages || [])],
      { model: "yandexgpt-lite", temperature: 0.7, maxTokens: 500 },
    );

    void logAIUsage({
      operation: "chat",
      route: "landing/chat",
      model: "yandexgpt-lite",
      inputTokens: Number(result.usage?.inputTextTokens ?? 0),
      outputTokens: Number(result.usage?.completionTokens ?? 0),
      totalTokens: Number(result.usage?.totalTokens ?? 0),
      durationMs: Date.now() - startedAt,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        // Фронт ожидает формат "0:" + JSON.stringify(string) + "\n".
        controller.enqueue(encoder.encode(`0:${JSON.stringify(result.text)}\n`));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Landing chat error:", error);
    return NextResponse.json({ error: "Ошибка при обработке запроса" }, { status: 500 });
  }
}
