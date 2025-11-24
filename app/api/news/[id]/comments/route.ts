import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/news/[id]/comments - получить комментарии к новости
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(params);
    const { id } = resolvedParams;
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const skip = (page - 1) * limit;

    // Проверяем существование новости
    const newsPost = await prisma.newsPost.findUnique({
      where: { id },
      select: { id: true, isPublished: true },
    });

    if (!newsPost) {
      return NextResponse.json({ error: "News not found" }, { status: 404 });
    }

    const session = await getServerSession(authOptions);
    if (!newsPost.isPublished && session?.user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "News not found" }, { status: 404 });
    }

    const [comments, total] = await Promise.all([
      prisma.newsComment.findMany({
        where: {
          newsPostId: id,
          parentId: null, // Только корневые комментарии
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatarUrl: true,
            },
          },
          replies: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
            orderBy: {
              createdAt: "asc",
            },
          },
          _count: {
            select: {
              replies: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
      }),
      prisma.newsComment.count({
        where: {
          newsPostId: id,
          parentId: null,
        },
      }),
    ]);

    return NextResponse.json({
      comments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("[api/news/[id]/comments] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch comments" },
      { status: 500 }
    );
  }
}

// POST /api/news/[id]/comments - создать комментарий
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await Promise.resolve(params);
    const { id } = resolvedParams;
    const { content, parentId } = await request.json();

    if (!content || !content.trim()) {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 }
      );
    }

    // Проверяем существование новости
    const newsPost = await prisma.newsPost.findUnique({
      where: { id },
      select: { id: true, isPublished: true },
    });

    if (!newsPost) {
      return NextResponse.json({ error: "News not found" }, { status: 404 });
    }

    if (!newsPost.isPublished && session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "News not found" }, { status: 404 });
    }

    // Если есть parentId, проверяем существование родительского комментария
    if (parentId) {
      const parent = await prisma.newsComment.findUnique({
        where: { id: parentId },
        select: { id: true, newsPostId: true },
      });

      if (!parent || parent.newsPostId !== id) {
        return NextResponse.json(
          { error: "Parent comment not found" },
          { status: 404 }
        );
      }
    }

    const comment = await prisma.newsComment.create({
      data: {
        newsPostId: id,
        userId: session.user.id,
        content: content.trim(),
        parentId: parentId || null,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        replies: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        _count: {
          select: {
            replies: true,
          },
        },
      },
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error("[api/news/[id]/comments] Error:", error);
    return NextResponse.json(
      { error: "Failed to create comment" },
      { status: 500 }
    );
  }
}

