import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

const handler = NextAuth(authOptions);

// Оборачиваем обработчики для правильной обработки ошибок
async function handleRequest(
  req: NextRequest,
  handlerFn: (req: Request) => Promise<Response>
) {
  try {
    // NextAuth ожидает обычный Request, а не NextRequest
    const request = new Request(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
    });
    const response = await handlerFn(request);
    return response;
  } catch (error) {
    console.error("[NextAuth] Error:", error);
    // Возвращаем JSON ошибку вместо HTML
    return NextResponse.json(
      { 
        error: "Authentication error",
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handleRequest(req, (r) => handler(r));
}

export async function POST(req: NextRequest) {
  return handleRequest(req, (r) => handler(r));
}
