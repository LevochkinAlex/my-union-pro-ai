import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { content } = await request.json();

    if (!content || !content.trim()) {
      return NextResponse.json(
        { error: "Содержимое не может быть пустым" },
        { status: 400 }
      );
    }

    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      prompt: `Перепиши следующий текст, улучшив его стиль, грамматику и структуру, но сохрани основную мысль и смысл. Ответь только переписанным текстом без дополнительных комментариев:\n\n${content}`,
    });

    return NextResponse.json({ rewritten: text });
  } catch (error: any) {
    console.error("[ai/rewrite-article] Error:", error);
    return NextResponse.json(
      { error: "Ошибка при переписывании текста" },
      { status: 500 }
    );
  }
}

