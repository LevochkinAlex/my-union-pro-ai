import { NextResponse } from "next/server";
import OpenAI from "openai";

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

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages,
      ],
      max_tokens: 500,
      stream: true,
    });

    // Create a ReadableStream for SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of completion) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              // Format: 0:"content"
              controller.enqueue(encoder.encode(`0:${JSON.stringify(content)}\n`));
            }
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    console.error("Landing chat error:", error);
    return NextResponse.json(
      { error: "Ошибка при обработке запроса" },
      { status: 500 }
    );
  }
}
