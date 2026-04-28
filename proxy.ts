import { NextRequest, NextResponse } from "next/server";

const CORS_ORIGINS = ["http://localhost:8081", "http://localhost:19006"];

function isCorsOrigin(origin: string | null): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return !!origin && CORS_ORIGINS.some((o) => origin.startsWith(o));
}

/** Было middleware.ts — переименовано в proxy (Next.js 16+). CORS только для локальной разработки / API. */
export function proxy(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (request.method === "OPTIONS" && isCorsOrigin(origin)) {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin!,
        "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const response = NextResponse.next();

  if (isCorsOrigin(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin!);
    response.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }

  return response;
}

export const config = {
  matcher: "/api/:path*",
};
