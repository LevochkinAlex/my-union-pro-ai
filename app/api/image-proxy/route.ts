import { NextRequest, NextResponse } from "next/server";

/**
 * API route для проксирования и оптимизации изображений
 * Используется для оптимизации внешних изображений (например, из BestBenefits)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const imageUrl = searchParams.get("url");

  if (!imageUrl) {
    return new NextResponse("Missing image URL", { status: 400 });
  }

  try {
    // Проверяем, что URL безопасный
    const url = new URL(imageUrl);
    const allowedHosts = [
      "bestbenefits.ru",
      "cdn.jsdelivr.net",
      "images.unsplash.com",
      "localhost",
    ];

    if (!allowedHosts.some((host) => url.hostname.includes(host))) {
      return new NextResponse("Forbidden host", { status: 403 });
    }

    // Загружаем изображение
    const imageResponse = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (!imageResponse.ok) {
      return new NextResponse("Failed to fetch image", { status: 404 });
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const contentType = imageResponse.headers.get("content-type") || "image/jpeg";

    // Возвращаем изображение с кэшированием
    return new NextResponse(imageBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[image-proxy] Error proxying image:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}

