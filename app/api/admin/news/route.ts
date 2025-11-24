import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";

// GET /api/admin/news - получить все новости (включая неопубликованные)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (session?.user?.role !== UserRole.SUPER_ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    const [news, total] = await Promise.all([
      prisma.newsPost.findMany({
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatarUrl: true,
            },
          },
          _count: {
            select: {
              likes: true,
              comments: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
      }),
      prisma.newsPost.count(),
    ]);

    return NextResponse.json({
      news,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("[api/admin/news] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch news" },
      { status: 500 }
    );
  }
}

// POST /api/admin/news - создать новость
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (session?.user?.role !== UserRole.SUPER_ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { title, content, coverImage, isPublished, polls } = body;

    if (!title || !content) {
      return NextResponse.json(
        { error: "Title and content are required" },
        { status: 400 }
      );
    }

    // Создаем новость
    const newsPost = await prisma.newsPost.create({
      data: {
        title,
        content,
        coverImage: coverImage || null,
        authorId: session.user.id!,
        isPublished: isPublished || false,
        publishedAt: isPublished ? new Date() : null,
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    // Создаем опросы, если они есть
    if (polls && Array.isArray(polls) && polls.length > 0) {
      await Promise.all(
        polls.map((poll: any) =>
          prisma.newsPoll.create({
            data: {
              newsPostId: newsPost.id,
              question: poll.question,
              options: poll.options,
              isClosed: poll.isClosed || false,
              closesAt: poll.closesAt ? new Date(poll.closesAt) : null,
            },
          })
        )
      );
    }

    // Если новость опубликована, отправляем push-уведомления
    if (isPublished) {
      try {
        const subscriptions = await prisma.pushSubscription.findMany({
          where: {
            fcmToken: {
              not: null,
            },
          },
          select: { fcmToken: true },
          distinct: ["fcmToken"],
        });

        const fcmTokens = subscriptions
          .map((sub) => sub.fcmToken)
          .filter(Boolean) as string[];

        if (fcmTokens.length > 0) {
          const { messaging } = await import("@/lib/firebase-admin");
          const message = {
            notification: {
              title: "Новая новость",
              body: title,
            },
            webpush: {
              notification: {
                title: "Новая новость",
                body: title,
                icon: `${process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro"}/icon.png`,
                badge: `${process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro"}/icon.png`,
              },
              fcmOptions: {
                link: `${process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro"}/dashboard/news`,
              },
            },
            android: {
              priority: "high" as const,
              notification: {
                sound: "default",
              },
            },
            apns: {
              payload: {
                aps: {
                  sound: "default",
                },
              },
            },
            tokens: fcmTokens,
          };

          await messaging.sendEachForMulticast(message);
          console.log("[api/admin/news] Push notifications sent:", fcmTokens.length);
        }
      } catch (pushError) {
        console.error("[api/admin/news] Failed to send push notifications:", pushError);
        // Не прерываем создание новости из-за ошибки push-уведомлений
      }
    }

    // Получаем полную новость с опросами
    const fullNewsPost = await prisma.newsPost.findUnique({
      where: { id: newsPost.id },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        polls: true,
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
    });

    return NextResponse.json(fullNewsPost, { status: 201 });
  } catch (error) {
    console.error("[api/admin/news] Error:", error);
    return NextResponse.json(
      { error: "Failed to create news" },
      { status: 500 }
    );
  }
}

