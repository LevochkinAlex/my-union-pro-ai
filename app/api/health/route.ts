import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    console.log("[health] Проверка подключения к БД...");
    
    // Пытаемся выполнить простой запрос
    const userCount = await prisma.user.count();
    
    return NextResponse.json({
      status: "ok",
      database: "connected",
      userCount,
      env: {
        DATABASE_URL: process.env.DATABASE_URL ? "✓ set" : "✗ not set",
        SMTP_HOST: process.env.SMTP_HOST ? "✓ set" : "✗ not set",
        SMTP_PORT: process.env.SMTP_PORT ? "✓ set" : "✗ not set",
        SMTP_USER: process.env.SMTP_USER ? "✓ set" : "✗ not set",
        SMTP_PASSWORD: process.env.SMTP_PASSWORD ? "✓ set" : "✗ not set",
        SMTP_FROM: process.env.SMTP_FROM ? "✓ set" : "✗ not set",
        EXOLVE_API_KEY: process.env.EXOLVE_API_KEY ? "✓ set" : "✗ not set",
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ? "✓ set" : "✗ not set",
      },
    });
  } catch (error) {
    console.error("[health] Ошибка:", error);
    return NextResponse.json(
      {
        status: "error",
        database: "disconnected",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

