import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest } from "next/server";

const handler = NextAuth(authOptions);

// В Next.js 16 App Router NextAuth требует правильной обработки динамических роутов
// Нужно передать NextRequest с правильными query параметрами
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ nextauth: string[] }> }
) {
  try {
    // Извлекаем динамические сегменты из params
    const { nextauth } = await params;
    
    // Создаем URL с правильными query параметрами для NextAuth
    const url = new URL(req.url);
    
    // Добавляем сегменты nextauth в query параметры, если их нет
    if (nextauth && nextauth.length > 0 && !url.searchParams.has('nextauth')) {
      url.searchParams.set('nextauth', nextauth.join('/'));
    }
    
    // Создаем новый Request с правильным URL
    const request = new Request(url.toString(), {
      method: req.method,
      headers: req.headers,
    });
    
    return await handler(request);
  } catch (error) {
    console.error("[NextAuth] GET Error:", error);
    return Response.json(
      { 
        error: "Authentication error",
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ nextauth: string[] }> }
) {
  try {
    // Извлекаем динамические сегменты из params
    const { nextauth } = await params;
    
    // Создаем URL с правильными query параметрами для NextAuth
    const url = new URL(req.url);
    
    // Добавляем сегменты nextauth в query параметры, если их нет
    if (nextauth && nextauth.length > 0 && !url.searchParams.has('nextauth')) {
      url.searchParams.set('nextauth', nextauth.join('/'));
    }
    
    // Получаем body
    const body = await req.text();
    
    // Создаем новый Request с правильным URL и body
    const request = new Request(url.toString(), {
      method: req.method,
      headers: req.headers,
      body: body || undefined,
    });
    
    return await handler(request);
  } catch (error) {
    console.error("[NextAuth] POST Error:", error);
    return Response.json(
      { 
        error: "Authentication error",
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
