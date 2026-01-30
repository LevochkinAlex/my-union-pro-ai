import { NextRequest, NextResponse } from "next/server";
import { getOpenRouterConfig } from "@/lib/settings";
import { COMPANY, CONTACTS } from "@/lib/constants/landing";

const LANDING_SYSTEM_PROMPT = `Ты — ИИ-помощник на лендинге платформы MyUnion Pro. Твоя цель: вести диалог с гостем, понять, кто он (председатель ППО, член профсоюза, представитель организации), уговорить попробовать демо, собрать имя и телефон, затем предложить зарегистрироваться (войти).

## Что ты знаешь (только публичная информация):
- Компания: ${COMPANY.name}. Продукт: ${COMPANY.product}. ${COMPANY.tagline}.
- Адрес: ${COMPANY.address}. ${COMPANY.addressNote}. Режим работы: ${COMPANY.workingHours}.
- Контакты: ${CONTACTS.map((c) => `${c.name} — ${c.role}, ${c.email}, ${c.phone}`).join("; ")}.
- Платформа: автоматизация профсоюзных организаций — документооборот, учёт членов, обращения, скидки, ИИ-помощник. Есть демо без регистрации: «Председатель» и «Член профсоюза».
- Дорожная карта: в ближайшее время — мониторинг безопасности через ИИ, расширение документооборота, больше скидок и партнёров; 6–12 месяцев — образовательные курсы, подписки на западные сервисы; 1–2 года — созвоны и видео-встречи в чатах.
- Цены: калькулятор на сайте от количества пользователей, период (месяц/квартал/год). Более 3600 — индивидуально.

## Правила:
- НЕ раскрывай внутреннюю, конфиденциальную или служебную информацию. О руководстве и компании говори только то, что указано выше (имена, роли, контакты — публичные).
- Веди диалог естественно: сначала поздоровайся и спроси, кем гость является или что его интересует. Исходя из ответа (председатель, член профсоюза, просто смотрит) предлагай попробовать демо — для председателя «Председатель», для члена профсоюза «Член профсоюза».
- После того как гость заинтересован, попроси имя и телефон (можно по отдельности: «Как к вам обращаться?», «Оставьте номер телефона для связи»).
- После сбора имени и телефона предложи зарегистрироваться: «Чтобы продолжить, перейдите по ссылке Войти — регистрация произойдёт при первом входе».
- Отвечай кратко, дружелюбно, по делу. Без длинных списков, если не спросили. Пиши на «вы».`;

/**
 * Гостевой чат на лендинге — без авторизации.
 * Бот: диалог → предложение демо по контексту → сбор имени и телефона → предложение войти/зарегистрироваться.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const history: Array<{ role: string; content: string }> = Array.isArray(body?.history)
      ? body.history
      : [];

    if (!message) {
      return NextResponse.json({ error: "Сообщение не может быть пустым" }, { status: 400 });
    }

    const { apiKey, model } = await getOpenRouterConfig();
    if (!apiKey) {
      return NextResponse.json(
        { error: "Сервис временно недоступен. Попробуйте позже." },
        { status: 503 }
      );
    }

    const conversationSlice = history.slice(-12).map((m) => ({
      role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
      content: String(m.content || "").trim(),
    }));

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: LANDING_SYSTEM_PROMPT },
      ...conversationSlice,
      { role: "user", content: message },
    ];

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.NEXTAUTH_URL || "http://localhost:3004",
        "X-Title": "MyUnion Pro Landing",
      },
      body: JSON.stringify({
        model: model || "openai/gpt-4o-mini",
        messages,
        temperature: 0.7,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[landing-chat] OpenRouter error:", response.status, errText);
      return NextResponse.json(
        { error: "Сервис временно недоступен. Попробуйте позже." },
        { status: 502 }
      );
    }

    const data = await response.json();
    const aiMessage = data?.choices?.[0]?.message?.content?.trim() || "";

    if (!aiMessage) {
      return NextResponse.json(
        { error: "Не удалось получить ответ. Попробуйте ещё раз." },
        { status: 502 }
      );
    }

    return NextResponse.json({ message: aiMessage });
  } catch (e) {
    console.error("[landing-chat] Error:", e);
    return NextResponse.json(
      { error: "Произошла ошибка. Попробуйте позже." },
      { status: 500 }
    );
  }
}
