import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    console.log("[health] Проверка подключения к БД...");
    
    // Пытаемся выполнить простой запрос
    const userCount = await prisma.user.count();

    const authUrl = (process.env.NEXTAUTH_URL ?? "").trim();
    const publicApp = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
    const hints: string[] = [];
    if (!process.env.DATABASE_URL) hints.push("DATABASE_URL не задан — задайте и перезапустите PM2");
    if (!process.env.NEXTAUTH_SECRET) hints.push("NEXTAUTH_SECRET не задан — сессии не будут работать");
    if (!authUrl) hints.push("NEXTAUTH_URL не задан — OAuth/redirect могут быть неверны");
    if (authUrl.includes("cdn.myunion.pro") || publicApp.includes("cdn.myunion.pro")) {
      hints.push("NEXTAUTH/NEXT_PUBLIC_APP_URL указывает на CDN-субдомен — для сайта используйте https://myunion.pro");
    }

    return NextResponse.json({
      status: "ok",
      database: "connected",
      userCount,
      afterDbOutage:
        "После включения PostgreSQL выполните на VDS: cd /opt/my-union-pro && pnpm run vds:recover",
      env: {
        DATABASE_URL: process.env.DATABASE_URL ? "✓ set" : "✗ not set",
        NEXTAUTH_URL: authUrl ? "✓ set" : "✗ not set",
        NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ? "✓ set" : "✗ not set",
        NEXT_PUBLIC_APP_URL: publicApp ? "✓ set" : "✗ not set",
        SMTP_HOST: process.env.SMTP_HOST ? "✓ set" : "✗ not set",
        SMTP_PORT: process.env.SMTP_PORT ? "✓ set" : "✗ not set",
        SMTP_USER: process.env.SMTP_USER ? "✓ set" : "✗ not set",
        SMTP_PASSWORD: process.env.SMTP_PASSWORD ? "✓ set" : "✗ not set",
        SMTP_FROM: process.env.SMTP_FROM ? "✓ set" : "✗ not set",
        EXOLVE_API_KEY: process.env.EXOLVE_API_KEY ? "✓ set" : "✗ not set",
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ? "✓ set" : "✗ not set",
      },
      hints: hints.length > 0 ? hints : undefined,
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

