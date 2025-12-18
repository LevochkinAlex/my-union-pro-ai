import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export async function GET() {
  // Отправляем тестовую ошибку в Sentry
  Sentry.captureException(new Error("Sentry Example API Error - Test verification"));
  
  return NextResponse.json({
    success: true,
    message: "Test error sent to Sentry",
  });
}

