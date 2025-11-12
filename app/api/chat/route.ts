import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOpenRouterConfig } from "@/lib/settings";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// Промпт для сбора данных профиля
const SYSTEM_PROMPT = `Ты - помощник профсоюза, который помогает новым членам заполнить свой профиль. 
Твоя задача - вежливо и дружелюбно собрать следующую информацию о пользователе:

1. **ФИО**: Фамилия, Имя, Отчество (обязательно)
2. **Дата рождения**: в формате ДД.ММ.ГГГГ (обязательно)
3. **Адрес**: полный адрес проживания (обязательно, будет использован DaData для валидации)
4. **Телефон**: номер телефона в формате +7XXXXXXXXXX (обязательно)
5. **Должность**: занимаемая должность на работе (обязательно)
6. **Профессия**: основная профессия (обязательно)
7. **Образование**: уровень образования (например: среднее, среднее специальное, высшее) (обязательно)
8. **Организация**: название организации, где работает пользователь (можно поиск по ИНН) (обязательно)

Соблюдай следующие правила:
- Задавай вопросы по одному, не перегружай пользователя
- Будь дружелюбным и профессиональным
- Если пользователь уже предоставил какую-то информацию, не спрашивай повторно
- Отвечай на русском языке
- Если пользователь задает вопросы не по теме профиля, вежливо направь его обратно к заполнению профиля
- После сбора всех обязательных данных, подтверди их списком и сообщи: "Отлично! Все данные собраны. Теперь вы можете загрузить свою подпись и сгенерировать заявления для вступления в профсоюз."

Важно: Когда соберешь все данные, в конце ответа добавь специальный маркер: [PROFILE_COMPLETE] - это сигнал системе, что профиль готов к сохранению.

Начни с приветствия: "Здравствуйте! Я помогу вам заполнить профиль для вступления в профсоюз. Давайте начнем с вашего ФИО. Пожалуйста, укажите вашу фамилию, имя и отчество."`;

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const { message } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Сообщение обязательно" },
        { status: 400 }
      );
    }

    // Получаем историю сообщений пользователя
    const chatHistory = await prisma.chatMessage.findMany({
      where: {
        userId: session.user.id,
      },
      orderBy: {
        createdAt: "asc",
      },
      take: 50, // Последние 50 сообщений
    });

    // Формируем массив сообщений для OpenRouter
    const messages = [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      ...chatHistory.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      {
        role: "user",
        content: message,
      },
    ];

    // Сохраняем сообщение пользователя
    await prisma.chatMessage.create({
      data: {
        userId: session.user.id,
        role: "user",
        content: message,
      },
    });

    const openRouterConfig = await getOpenRouterConfig();

    if (!openRouterConfig.apiKey) {
      console.error("[chat] OpenRouter API ключ не настроен");
      return NextResponse.json(
        { error: "AI недоступен. Обратитесь к администратору." },
        { status: 503 },
      );
    }

    // Отправляем запрос в OpenRouter
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openRouterConfig.apiKey}`,
        "HTTP-Referer": process.env.NEXTAUTH_URL || "http://localhost:3000",
        "X-Title": "MyUnion Pro",
      },
      body: JSON.stringify({
        model: openRouterConfig.model || "openai/gpt-4o-mini",
        messages: messages,
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("OpenRouter API error:", errorData);
      return NextResponse.json(
        { error: "Ошибка при обращении к AI" },
        { status: 500 }
      );
    }

    const data = await response.json();
    const aiResponse = data.choices[0]?.message?.content || "Извините, не удалось получить ответ.";

    // Сохраняем ответ AI
    await prisma.chatMessage.create({
      data: {
        userId: session.user.id,
        role: "assistant",
        content: aiResponse,
      },
    });

    return NextResponse.json({
      message: aiResponse,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

// GET - получение истории сообщений
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const messages = await prisma.chatMessage.findMany({
      where: {
        userId: session.user.id,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    return NextResponse.json({ messages });
  } catch (error) {
    console.error("Get messages error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

