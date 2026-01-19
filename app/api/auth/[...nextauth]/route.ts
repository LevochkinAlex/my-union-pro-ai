import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);

// В Next.js 16 NextAuth handler может принимать NextRequest напрямую
// Но для совместимости нужно передать обычный Request
// Используем более простой подход - передаем запрос как есть
export async function GET(req: Request) {
  try {
    return await handler(req);
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

export async function POST(req: Request) {
  try {
    return await handler(req);
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
