import { NextRequest, NextResponse } from "next/server";

interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  favicon: string | null;
  type: "website" | "video" | "article";
  videoUrl?: string;
  videoType?: "youtube" | "vimeo" | "other";
  videoId?: string;
}

// Extract YouTube video ID
function getYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

// Extract Vimeo video ID
function getVimeoVideoId(url: string): string | null {
  const pattern = /vimeo\.com\/(\d+)/;
  const match = url.match(pattern);
  return match ? match[1] : null;
}

// Parse Open Graph and meta tags
async function fetchLinkPreview(url: string): Promise<LinkPreview> {
  try {
    // Check if it's a video URL
    const youtubeId = getYouTubeVideoId(url);
    if (youtubeId) {
      return {
        url,
        title: `YouTube Video`,
        description: null,
        image: `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`,
        siteName: "YouTube",
        favicon: "https://www.youtube.com/favicon.ico",
        type: "video",
        videoType: "youtube",
        videoId: youtubeId,
        videoUrl: url,
      };
    }

    const vimeoId = getVimeoVideoId(url);
    if (vimeoId) {
      // Fetch Vimeo API for thumbnail
      const vimeoResponse = await fetch(`https://vimeo.com/api/v2/video/${vimeoId}.json`);
      const vimeoData = await vimeoResponse.json();
      const video = vimeoData[0];

      return {
        url,
        title: video?.title || "Vimeo Video",
        description: video?.description || null,
        image: video?.thumbnail_large || null,
        siteName: "Vimeo",
        favicon: "https://vimeo.com/favicon.ico",
        type: "video",
        videoType: "vimeo",
        videoId: vimeoId,
        videoUrl: url,
      };
    }

    // Fetch the URL
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LinkPreviewBot/1.0)",
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status}`);
    }

    const html = await response.text();

    // Parse Open Graph and meta tags
    const ogTitle = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]*)"[^>]*>/i)?.[1];
    const ogDescription = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]*)"[^>]*>/i)?.[1];
    const ogImage = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"[^>]*>/i)?.[1];
    const ogSiteName = html.match(/<meta[^>]*property="og:site_name"[^>]*content="([^"]*)"[^>]*>/i)?.[1];
    const ogType = html.match(/<meta[^>]*property="og:type"[^>]*content="([^"]*)"[^>]*>/i)?.[1];

    // Fallback to regular meta tags
    const metaTitle = html.match(/<meta[^>]*name="title"[^>]*content="([^"]*)"[^>]*>/i)?.[1];
    const metaDescription = html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i)?.[1];
    const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];

    // Get favicon
    const faviconLink = html.match(/<link[^>]*rel="(?:shortcut )?icon"[^>]*href="([^"]*)"[^>]*>/i)?.[1];
    let favicon = faviconLink;
    if (favicon && !favicon.startsWith("http")) {
      const urlObj = new URL(url);
      favicon = favicon.startsWith("/") 
        ? `${urlObj.origin}${favicon}` 
        : `${urlObj.origin}/${favicon}`;
    }

    // Determine type
    let type: "website" | "video" | "article" = "website";
    if (ogType === "video" || ogType === "video.other") {
      type = "video";
    } else if (ogType === "article") {
      type = "article";
    }

    return {
      url,
      title: ogTitle || metaTitle || titleTag || new URL(url).hostname,
      description: ogDescription || metaDescription || null,
      image: ogImage || null,
      siteName: ogSiteName || new URL(url).hostname,
      favicon: favicon || `${new URL(url).origin}/favicon.ico`,
      type,
    };
  } catch (error) {
    console.error("[link-preview] Error fetching preview:", error);
    
    // Return basic info on error
    const urlObj = new URL(url);
    return {
      url,
      title: urlObj.hostname,
      description: null,
      image: null,
      siteName: urlObj.hostname,
      favicon: `${urlObj.origin}/favicon.ico`,
      type: "website",
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL" },
        { status: 400 }
      );
    }

    const preview = await fetchLinkPreview(url);

    return NextResponse.json(preview);
  } catch (error) {
    console.error("[link-preview] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch link preview" },
      { status: 500 }
    );
  }
}

