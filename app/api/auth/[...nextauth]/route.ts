import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest } from "next/server";

const handler = NextAuth(authOptions);

// NextAuth handler должен получать Request напрямую
// Исправляем обработку для Next.js 16
export async function GET(req: NextRequest) {
  try {
    // Создаем правильный Request объект с query параметрами
    const url = new URL(req.url);
    const request = new Request(url.toString(), {
      method: req.method,
      headers: req.headers,
      // Для GET запросов body не нужен
    });
    return await handler(request);
  } catch (error) {
    console.error("[NextAuth] GET Error:", error);
    // Возвращаем JSON ошибку вместо HTML
    return Response.json(
      { 
        error: "Authentication error",
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    // Создаем правильный Request объект с body
    const url = new URL(req.url);
    const body = await req.text();
    
    // Создаем Request с body через ReadableStream для Next.js 16
    const requestInit: RequestInit = {
      method: req.method,
      headers: req.headers,
    };
    
    if (body) {
      // Используем ReadableStream для body в Next.js 16
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(body));
          controller.close();
        },
      });
      requestInit.body = stream;
    }
    
    const request = new Request(url.toString(), requestInit);
    return await handler(request);
  } catch (error) {
    console.error("[NextAuth] POST Error:", error);
    // Возвращаем JSON ошибку вместо HTML
    return Response.json(
      { 
        error: "Authentication error",
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
