import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/link-preview
 * Получает Open Graph метаданные для ссылки
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const url = searchParams.get("url");

    if (!url) {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    // Валидация URL
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL" },
        { status: 400 }
      );
    }

    // Получаем HTML страницы
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MyUnionBot/1.0; +https://myunion.pro)",
      },
      signal: AbortSignal.timeout(5000), // Таймаут 5 секунд
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch URL" },
        { status: response.status }
      );
    }

    const html = await response.text();

    // Извлекаем OG метаданные
    const preview: {
      url: string;
      title?: string;
      description?: string;
      image?: string;
      siteName?: string;
      type?: string;
      videoUrl?: string;
      videoType?: string;
    } = {
      url,
    };

    // Извлекаем title
    const titleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
                   html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) {
      preview.title = titleMatch[1].trim();
    }

    // Извлекаем description
    const descMatch = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i) ||
                     html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
    if (descMatch) {
      preview.description = descMatch[1].trim();
    }

    // Извлекаем image
    const imageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
    if (imageMatch) {
      preview.image = imageMatch[1].trim();
    }

    // Извлекаем siteName
    const siteMatch = html.match(/<meta\s+property=["']og:site_name["']\s+content=["']([^"']+)["']/i);
    if (siteMatch) {
      preview.siteName = siteMatch[1].trim();
    }

    // Извлекаем type
    const typeMatch = html.match(/<meta\s+property=["']og:type["']\s+content=["']([^"']+)["']/i);
    if (typeMatch) {
      preview.type = typeMatch[1].trim() as any;
    }

    // Для видео извлекаем video URL
    if (preview.type === "video.other" || preview.type === "video") {
      const videoMatch = html.match(/<meta\s+property=["']og:video["']\s+content=["']([^"']+)["']/i);
      if (videoMatch) {
        preview.videoUrl = videoMatch[1].trim();
      }
      
      const videoTypeMatch = html.match(/<meta\s+property=["']og:video:type["']\s+content=["']([^"']+)["']/i);
      if (videoTypeMatch) {
        preview.videoType = videoTypeMatch[1].trim();
      }
    }

    // Для YouTube и Vimeo определяем тип видео
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      preview.type = 'video';
      preview.videoUrl = url;
      preview.videoType = 'video/youtube';
    } else if (url.includes('vimeo.com')) {
      preview.type = 'video';
      preview.videoUrl = url;
      preview.videoType = 'video/vimeo';
    }

    return NextResponse.json({ preview });
  } catch (error: any) {
    Sentry.captureException(error);
    console.error("[link-preview] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch link preview",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined,
      },
      { status: 500 }
    );
  }
}
