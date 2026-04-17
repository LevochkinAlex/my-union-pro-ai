import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isDemoUserId } from "@/lib/demo";
import { callYandexChat, isYandexConfigured } from "@/lib/yandex-ai";
import { logAIUsage } from "@/lib/ai-usage";

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
    const history: Array<{ role: string; content: string }> = Array.isArray(body?.history)
      ? body.history
      : [];

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json({ error: "Сообщение не может быть пустым" }, { status: 400 });
    }

    if (!isYandexConfigured()) {
      return NextResponse.json({
        message:
          "ИИ-помощник временно недоступен в демо-режиме. Зарегистрируйтесь для полного доступа.",
      });
    }

    const conversationSlice = history.slice(-10);
    const messages = [
      { role: "system" as const, content: DEMO_SYSTEM_PROMPT },
      ...conversationSlice.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: message.trim() },
    ];

    const startedAt = Date.now();
    try {
      // Для демо используем лёгкую модель — быстрее и дешевле
      const result = await callYandexChat(messages, {
        model: "yandexgpt-lite",
        temperature: 0.7,
        maxTokens: 1000,
      });

      void logAIUsage({
        operation: "chat",
        route: "assistant/demo-chat",
        model: "yandexgpt-lite",
        inputTokens: Number(result.usage?.inputTextTokens ?? 0),
        outputTokens: Number(result.usage?.completionTokens ?? 0),
        totalTokens: Number(result.usage?.totalTokens ?? 0),
        userId: session.user.id,
        durationMs: Date.now() - startedAt,
      });

      return NextResponse.json({ message: result.text });
    } catch (err) {
      console.error("[demo-chat] Yandex error:", err);
      return NextResponse.json({
        message: "Не удалось получить ответ от ИИ. Попробуйте позже.",
      });
    }
  } catch (error) {
    console.error("[demo-chat] Error:", error);
    return NextResponse.json({
      message: "Произошла ошибка. Попробуйте позже.",
    });
  }
}
