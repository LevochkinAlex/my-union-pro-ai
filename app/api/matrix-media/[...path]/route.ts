import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const MATRIX_SERVER = process.env.MATRIX_SERVER_URL || 'https://matrix.myunion.pro';

/**
 * Proxy for Matrix media files
 * Adds authentication header required by Matrix API
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's Matrix credentials
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { matrixAccessToken: true },
    });

    if (!user?.matrixAccessToken) {
      return NextResponse.json({ error: 'No Matrix credentials' }, { status: 401 });
    }

    const { path } = await params;
    
    // Path format: ['matrix.myunion.pro', 'elyDS...'] or ['matrix.myunion.pro', 'part1', 'part2', ...]
    // We need serverName and mediaId
    if (path.length < 2) {
      return NextResponse.json({ error: 'Invalid media path' }, { status: 400 });
    }
    
    const serverName = path[0];
    const mediaId = path.slice(1).join('/'); // Join remaining parts in case mediaId has slashes
    
    // Get thumbnail params if present
    const { searchParams } = new URL(request.url);
    const width = searchParams.get('width');
    const height = searchParams.get('height');
    const method = searchParams.get('method');
    
    // Build Matrix URL - use v3 API format
    let matrixUrl: string;
    if (width && height) {
      // Thumbnail request
      matrixUrl = `${MATRIX_SERVER}/_matrix/media/v3/thumbnail/${encodeURIComponent(serverName)}/${encodeURIComponent(mediaId)}?width=${width}&height=${height}&method=${method || 'scale'}`;
    } else {
      // Full download
      matrixUrl = `${MATRIX_SERVER}/_matrix/media/v3/download/${encodeURIComponent(serverName)}/${encodeURIComponent(mediaId)}`;
    }

    // Fetch from Matrix with auth (with timeout)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    let response: Response;
    try {
      response = await fetch(matrixUrl, {
        headers: {
          'Authorization': `Bearer ${user.matrixAccessToken}`,
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        console.error(`Matrix media timeout for ${serverName}/${mediaId}`);
        return NextResponse.json({ error: 'Request timeout' }, { status: 504 });
      }
      throw error;
    }

    if (!response.ok) {
      // 404 is normal for missing/deleted media, return 404 silently
      if (response.status === 404) {
        return new NextResponse(null, { status: 404, statusText: 'Not Found' });
      }
      
      // Log other errors (but not 404)
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`Matrix media error: ${response.status} for ${serverName}/${mediaId}, URL: ${matrixUrl}, Response: ${errorText}`);
      return NextResponse.json({ error: 'Media not found', details: errorText }, { status: response.status });
    }

    // Get content type
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    
    // Stream the response
    const blob = await response.blob();
    
    return new NextResponse(blob, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Matrix media proxy error:', error);
    return NextResponse.json({ error: 'Failed to fetch media' }, { status: 500 });
  }
}
