import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";

// GET /api/admin/news/[id] - получить новость для редактирования
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (session?.user?.role !== UserRole.SUPER_ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const resolvedParams = await Promise.resolve(params);
    const { id } = resolvedParams;

    const newsPost = await prisma.newsPost.findUnique({
      where: { id },
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

    if (!newsPost) {
      return NextResponse.json({ error: "News not found" }, { status: 404 });
    }

    return NextResponse.json(newsPost);
  } catch (error) {
    console.error("[api/admin/news/[id]] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch news" },
      { status: 500 }
    );
  }
}

// PUT /api/admin/news/[id] - обновить новость
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (session?.user?.role !== UserRole.SUPER_ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const resolvedParams = await Promise.resolve(params);
    const { id } = resolvedParams;
    const body = await request.json();
    const { title, content, coverImage, isPublished, polls } = body;

    // Проверяем существование новости
    const existingPost = await prisma.newsPost.findUnique({
      where: { id },
      select: { id: true, isPublished: true },
    });

    if (!existingPost) {
      return NextResponse.json({ error: "News not found" }, { status: 404 });
    }

    // Обновляем новость
    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;
    if (coverImage !== undefined) updateData.coverImage = coverImage;
    if (isPublished !== undefined) {
      updateData.isPublished = isPublished;
      // Если публикуем впервые, устанавливаем publishedAt
      if (isPublished && !existingPost.isPublished) {
        updateData.publishedAt = new Date();
      }
    }

    const newsPost = await prisma.newsPost.update({
      where: { id },
      data: updateData,
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

    // Обновляем опросы
    if (polls !== undefined) {
      // Удаляем старые опросы
      await prisma.newsPoll.deleteMany({
        where: { newsPostId: id },
      });

      // Создаем новые опросы
      if (Array.isArray(polls) && polls.length > 0) {
        await Promise.all(
          polls.map((poll: any) =>
            prisma.newsPoll.create({
              data: {
                newsPostId: id,
                question: poll.question,
                options: poll.options,
                isClosed: poll.isClosed || false,
                closesAt: poll.closesAt ? new Date(poll.closesAt) : null,
              },
            })
          )
        );
      }
    }

    // Если новость только что опубликована, отправляем push-уведомления
    if (isPublished && !existingPost.isPublished) {
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
              body: newsPost.title,
            },
            webpush: {
              notification: {
                title: "Новая новость",
                body: newsPost.title,
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
          console.log("[api/admin/news/[id]] Push notifications sent:", fcmTokens.length);
        }
      } catch (pushError) {
        console.error("[api/admin/news/[id]] Failed to send push notifications:", pushError);
      }
    }

    // Получаем обновленную новость
    const updatedPost = await prisma.newsPost.findUnique({
      where: { id },
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

    return NextResponse.json(updatedPost);
  } catch (error) {
    console.error("[api/admin/news/[id]] Error:", error);
    return NextResponse.json(
      { error: "Failed to update news" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/news/[id] - удалить новость
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (session?.user?.role !== UserRole.SUPER_ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const resolvedParams = await Promise.resolve(params);
    const { id } = resolvedParams;

    // Проверяем существование новости
    const newsPost = await prisma.newsPost.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!newsPost) {
      return NextResponse.json({ error: "News not found" }, { status: 404 });
    }

    // Удаляем новость (каскадное удаление через схему)
    await prisma.newsPost.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[api/admin/news/[id]] Error:", error);
    return NextResponse.json(
      { error: "Failed to delete news" },
      { status: 500 }
    );
  }
}

