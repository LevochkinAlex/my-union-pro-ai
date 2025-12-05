import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/posts/[postId]/view - увеличить счётчик просмотров
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { postId } = await params;

    if (!postId) {
      return NextResponse.json({ error: "ID поста не указан" }, { status: 400 });
    }

    // Увеличиваем счетчик просмотров
    const updatedPost = await prisma.userPost.update({
      where: { id: postId },
      data: {
        viewCount: {
          increment: 1,
        },
      },
      select: {
        viewCount: true,
      },
    });

    return NextResponse.json({ viewCount: updatedPost.viewCount });
  } catch (error: any) {
    console.error("[posts/[postId]/view] Error:", error);
    return NextResponse.json(
      { error: "Failed to increment view count" },
      { status: 500 }
    );
  }
}

