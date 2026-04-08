import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isDemoUserId } from "@/lib/demo";

const DEMO_SYSTEM_PROMPT = `Ты — ИИ-помощник платформы MyUnion Pro. Ты помогаешь членам профсоюза и председателям ППО.

Ты можешь помочь с:
- Трудовым кодексом РФ и правами работников
- Общими вопросами о деятельности профсоюзных организаций
- Информацией о возможностях платформы MyUnion Pro (обращения, документооборот, новости, скидки, чаты, отчётность)
- Подготовкой текстов обращений и заявлений
- Вопросами о проведении заседаний профкома

ВАЖНО: Ты работаешь в демо-режиме. У тебя НЕТ доступа к реальным данным организаций, пользователей или документов.
Если пользователь спрашивает о конкретных данных, объясни что это демо-режим и предложи зарегистрироваться для полного доступа.

Отвечай на русском языке. Будь вежлив и краток.`;

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !isDemoUserId(session.user.id)) {
      return NextResponse.json({ error: "Доступ только для демо-пользователей" }, { status: 403 });
    }

    const body = await request.json();
    const message = body?.message;
    const history: Array<{ role: string; content: string }> = Array.isArray(body?.history) ? body.history : [];

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json({ error: "Сообщение не может быть пустым" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        message: "ИИ-помощник временно недоступен в демо-режиме. Зарегистрируйтесь для полного доступа.",
      });
    }

    const isOpenRouter = !process.env.OPENAI_API_KEY && !!process.env.OPENROUTER_API_KEY;
    const baseUrl = isOpenRouter ? "https://openrouter.ai/api/v1" : "https://api.openai.com/v1";
    const model = isOpenRouter ? "openai/gpt-4o-mini" : "gpt-4o-mini";

    const conversationSlice = history.slice(-10);
    const messages = [
      { role: "system", content: DEMO_SYSTEM_PROMPT },
      ...conversationSlice.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: message.trim() },
    ];

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(isOpenRouter ? { "HTTP-Referer": "https://myunion.pro", "X-Title": "MyUnion Pro Demo" } : {}),
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      console.error("[demo-chat] AI API error:", response.status);
      return NextResponse.json({
        message: "Не удалось получить ответ от ИИ. Попробуйте позже.",
      });
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content?.trim() || "Не удалось получить ответ.";

    return NextResponse.json({ message: aiResponse });
  } catch (error) {
    console.error("[demo-chat] Error:", error);
    return NextResponse.json({
      message: "Произошла ошибка. Попробуйте позже.",
    });
  }
}
