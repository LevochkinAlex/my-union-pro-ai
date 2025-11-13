import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Find Appeal Bot by name
    const appealBot = await prisma.chatBot.findFirst({
      where: { name: "Appeal Bot" },
      select: { id: true },
    });

    if (!appealBot) {
      return NextResponse.json(
        { error: "Appeal Bot not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ chatBotId: appealBot.id });
  } catch (error) {
    console.error("[api/chat/appeal-bot] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

